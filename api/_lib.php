<?php
/* Shared helpers for the Oxygen Vault sync API.
   This file is included by every endpoint and must NEVER be requested
   directly. The sibling `.htaccess` blocks direct access. */

declare(strict_types=1);

ini_set('display_errors', '0');
error_reporting(E_ALL);

function load_config(): array {
    $path = __DIR__ . '/config.php';
    if (!is_file($path)) {
        send_json(500, ['error' => 'server_misconfigured', 'detail' => 'config.php missing']);
    }
    $cfg = require $path;
    if (!is_array($cfg)) {
        send_json(500, ['error' => 'server_misconfigured', 'detail' => 'config.php must return array']);
    }
    return $cfg;
}

function send_json(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function apply_cors(array $cfg): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin && in_array($origin, $cfg['allowed_origins'] ?? [], true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 600');
    }
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function read_json_body(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        send_json(400, ['error' => 'empty_body']);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        send_json(400, ['error' => 'invalid_json']);
    }
    return $data;
}

/* Verify the Telegram-widget login payload using the bot token.
   This is the canonical algorithm from
   https://core.telegram.org/widgets/login#checking-authorization */
function verify_telegram_auth(array $auth, string $botToken): bool {
    if (empty($auth['hash']) || empty($auth['auth_date']) || empty($auth['id'])) {
        return false;
    }
    $hash = (string) $auth['hash'];
    unset($auth['hash']);

    $pairs = [];
    foreach ($auth as $k => $v) {
        if ($v === null) continue;
        $pairs[$k] = $k . '=' . (is_bool($v) ? ($v ? 'true' : 'false') : (string) $v);
    }
    ksort($pairs);
    $dataCheckString = implode("\n", array_values($pairs));

    $secretKey = hash('sha256', $botToken, true);
    $expected  = hash_hmac('sha256', $dataCheckString, $secretKey);

    if (!hash_equals($expected, $hash)) return false;

    $authDate = (int) $auth['auth_date'];
    $age = time() - $authDate;
    /* Allow up to 5 min of clock skew, max 24 h freshness. */
    if ($age < -300 || $age > 86400) return false;

    return true;
}

function db(array $cfg): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;dbname=%s;charset=utf8mb4',
            $cfg['db_host'],
            $cfg['db_name']
        );
        try {
            $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
        } catch (Throwable $e) {
            send_json(500, ['error' => 'db_connect_failed']);
        }
    }
    return $pdo;
}

function ensure_schema(PDO $pdo): void {
    $pdo->exec(<<<'SQL'
        CREATE TABLE IF NOT EXISTS vaults (
            telegram_id  BIGINT UNSIGNED NOT NULL PRIMARY KEY,
            library_json LONGTEXT        NOT NULL,
            updated_at   INT UNSIGNED    NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
SQL);
}

/* Extract + validate the Telegram payload from a request body. Returns
   a pair [auth_array, telegram_id]. Sends a JSON error and exits if
   anything is wrong. */
function require_authed_request(array $body, array $cfg): array {
    if (empty($body['auth']) || !is_array($body['auth'])) {
        send_json(400, ['error' => 'missing_auth']);
    }
    $auth = $body['auth'];
    if (!verify_telegram_auth($auth, $cfg['bot_token'])) {
        send_json(401, ['error' => 'invalid_auth']);
    }
    $tgId = (int) $auth['id'];
    if ($tgId <= 0) {
        send_json(400, ['error' => 'bad_id']);
    }
    return [$auth, $tgId];
}
