<?php
/* Image storage endpoint.

   POST { auth, data_url }   → uploads a base64 data URL, stores the
                              binary in the `images` table keyed by a
                              random UUID, returns { id, url }.
   GET  ?id=<uuid>           → streams the binary back with the right
                              content-type. No auth on GET because
                              every device that's allowed to see the
                              owning user's library already has the
                              UUID inside the synced library JSON, and
                              the IDs are random + unguessable.

   Goal: get base64 image blobs OUT of the synced library JSON so the
   per-user sync payload stays tiny (KBs not MBs) and a slow Android
   load can't end up trampling fresh data on the server. */

declare(strict_types=1);
require __DIR__ . '/_lib.php';

$cfg = load_config();
apply_cors($cfg);

$method = $_SERVER['REQUEST_METHOD'] ?? '';

if ($method === 'GET') {
    handle_get($cfg);
    exit;
}

if ($method !== 'POST') {
    send_json(405, ['error' => 'method_not_allowed']);
}

handle_post($cfg);
exit;

/* ───────────────────────── GET ───────────────────────── */

function handle_get(array $cfg): void {
    $id = isset($_GET['id']) ? (string) $_GET['id'] : '';
    if (!preg_match('/^[a-zA-Z0-9_-]{8,64}$/', $id)) {
        http_response_code(400);
        header('Content-Type: text/plain');
        echo 'bad_id';
        exit;
    }

    $pdo = db($cfg);
    ensure_schema($pdo);

    $stmt = $pdo->prepare('SELECT content_type, data FROM images WHERE id = :id');
    $stmt->execute(['id' => $id]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(404);
        header('Content-Type: text/plain');
        echo 'not_found';
        exit;
    }

    $ct = $row['content_type'] ?: 'application/octet-stream';
    header('Content-Type: ' . $ct);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('Content-Length: ' . strlen($row['data']));
    echo $row['data'];
}

/* ───────────────────────── POST ──────────────────────── */

function handle_post(array $cfg): void {
    $body = read_json_body();
    [$auth, $tgId] = require_authed_request($body, $cfg);

    $dataUrl = isset($body['data_url']) ? (string) $body['data_url'] : '';
    if ($dataUrl === '') {
        send_json(400, ['error' => 'missing_data_url']);
    }

    /* data:image/jpeg;base64,/9j/4AAQ… */
    if (!preg_match('#^data:([a-zA-Z0-9.+\-/]+);base64,(.+)$#s', $dataUrl, $m)) {
        send_json(400, ['error' => 'bad_data_url']);
    }
    $contentType = strtolower($m[1]);
    $allowed = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/avif',
    ];
    if (!in_array($contentType, $allowed, true)) {
        send_json(415, ['error' => 'unsupported_content_type']);
    }
    if ($contentType === 'image/jpg') $contentType = 'image/jpeg';

    $bin = base64_decode($m[2], true);
    if ($bin === false) {
        send_json(400, ['error' => 'bad_base64']);
    }

    /* Cap individual images at 5 MB. The existing client downscales
       to 800px JPEG so real uploads sit around 100-300 KB; this is
       a paranoia ceiling, not the steady-state size. */
    if (strlen($bin) > 5 * 1024 * 1024) {
        send_json(413, ['error' => 'image_too_large']);
    }

    $pdo = db($cfg);
    ensure_schema($pdo);

    /* 22-char URL-safe random ID (≈131 bits of entropy). Effectively
       unguessable. */
    $id = rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '=');

    $stmt = $pdo->prepare(<<<'SQL'
        INSERT INTO images (id, telegram_id, content_type, data, created_at)
        VALUES (:id, :tg, :ct, :data, :now)
SQL);
    $stmt->execute([
        'id'   => $id,
        'tg'   => $tgId,
        'ct'   => $contentType,
        'data' => $bin,
        'now'  => time(),
    ]);

    /* Same-origin URL — clients embed this directly in <img src="…">. */
    send_json(200, [
        'id'  => $id,
        'url' => '/api/image.php?id=' . $id,
    ]);
}
