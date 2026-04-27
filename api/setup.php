<?php
/* One-shot health + schema check. Hit this once after uploading
   to verify the API is wired up correctly. Safe to leave on the
   server but you can delete it after first run if you prefer. */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

$cfg = load_config();
apply_cors($cfg);

/* Bumped each time the API surface changes so the user can verify
   their cPanel upload landed correctly. */
const API_VERSION = '3.0-image-store';

$out = ['php' => PHP_VERSION, 'time' => time(), 'api_version' => API_VERSION];

try {
    $pdo = db($cfg);
    ensure_schema($pdo);
    $out['db'] = 'ok';
    $count = (int) $pdo->query('SELECT COUNT(*) FROM vaults')->fetchColumn();
    $out['rows'] = $count;
    $imgCount = (int) $pdo->query('SELECT COUNT(*) FROM images')->fetchColumn();
    $out['images'] = $imgCount;
} catch (Throwable $e) {
    send_json(500, ['error' => 'setup_failed', 'detail' => $e->getMessage()]);
}

$out['features'] = [
    'save_concurrency_check' => true,
    'image_store'            => true,
];
$out['bot_id_in_config'] = $cfg['bot_id'] ?? null;
$out['bot_token_set']    = !empty($cfg['bot_token']) && $cfg['bot_token'] !== 'PASTE_FULL_BOT_TOKEN_HERE';
$out['allowed_origins']  = $cfg['allowed_origins'];

send_json(200, $out);
