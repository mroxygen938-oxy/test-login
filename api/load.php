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

$pdo = db($cfg);
ensure_schema($pdo);

$stmt = $pdo->prepare('SELECT library_json, updated_at FROM vaults WHERE telegram_id = :id');
$stmt->execute(['id' => $tgId]);
$row = $stmt->fetch();

if (!$row) {
    send_json(200, ['library' => null, 'updated_at' => 0]);
}

$lib = json_decode($row['library_json'], true);
send_json(200, [
    'library'    => is_array($lib) ? $lib : null,
    'updated_at' => (int) $row['updated_at'],
]);
