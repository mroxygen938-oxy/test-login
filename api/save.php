<?php
declare(strict_types=1);
require __DIR__ . '/_lib.php';

$cfg = load_config();
apply_cors($cfg);

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    send_json(405, ['error' => 'method_not_allowed']);
}

$body = read_json_body();
[$auth, $tgId] = require_authed_request($body, $cfg);

if (!isset($body['library']) || !is_array($body['library'])) {
    send_json(400, ['error' => 'missing_library']);
}

/* Cap the library at 4 MB so a runaway client can't fill the DB. */
$json = json_encode($body['library'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    send_json(400, ['error' => 'unencodable_library']);
}
if (strlen($json) > 4 * 1024 * 1024) {
    send_json(413, ['error' => 'library_too_large']);
}

$pdo = db($cfg);
ensure_schema($pdo);

/* Optional optimistic-concurrency check. The client tells us the
   `updated_at` it last observed; if the DB has moved on since then,
   another device wrote in between and we MUST refuse this save so the
   stale snapshot can't trample fresh data. The client handles a 409
   by re-pulling and re-saving with the fresh `updated_at`. */
$expectedUpdatedAt = isset($body['expected_updated_at'])
    ? (int) $body['expected_updated_at']
    : null;

$cur = $pdo->prepare('SELECT updated_at FROM vaults WHERE telegram_id = :id');
$cur->execute(['id' => $tgId]);
$row = $cur->fetch();
$currentUpdatedAt = $row ? (int) $row['updated_at'] : 0;

if ($expectedUpdatedAt !== null && $currentUpdatedAt > $expectedUpdatedAt) {
    send_json(409, [
        'error'      => 'conflict',
        'updated_at' => $currentUpdatedAt,
    ]);
}

/* Make `updated_at` strictly monotonic so back-to-back saves within
   the same second still bump the version. This keeps the conflict
   check above meaningful even on a fast typer. */
$now = max($currentUpdatedAt + 1, time());

$stmt = $pdo->prepare(<<<'SQL'
    INSERT INTO vaults (telegram_id, library_json, updated_at)
    VALUES (:id, :lib, :now)
    ON DUPLICATE KEY UPDATE
        library_json = VALUES(library_json),
        updated_at   = VALUES(updated_at)
SQL);

$stmt->execute([
    'id'  => $tgId,
    'lib' => $json,
    'now' => $now,
]);

send_json(200, ['ok' => true, 'updated_at' => $now]);
