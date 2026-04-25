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

$now = time();
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
