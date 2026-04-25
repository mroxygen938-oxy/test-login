<?php
/* One-shot health + schema check. Hit this once after uploading
   to verify the API is wired up correctly. Safe to leave on the
   server but you can delete it after first run if you prefer. */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

$cfg = load_config();
apply_cors($cfg);

$out = ['php' => PHP_VERSION, 'time' => time()];

try {
    $pdo = db($cfg);
    ensure_schema($pdo);
    $out['db'] = 'ok';
    $count = (int) $pdo->query('SELECT COUNT(*) FROM vaults')->fetchColumn();
    $out['rows'] = $count;
} catch (Throwable $e) {
    send_json(500, ['error' => 'setup_failed', 'detail' => $e->getMessage()]);
}

$out['bot_id_in_config'] = $cfg['bot_id'] ?? null;
$out['bot_token_set']    = !empty($cfg['bot_token']) && $cfg['bot_token'] !== 'PASTE_FULL_BOT_TOKEN_HERE';
$out['allowed_origins']  = $cfg['allowed_origins'];

send_json(200, $out);
