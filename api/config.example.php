<?php
/* Copy this file to `config.php` and fill in real values.
   `config.php` is gitignored and must NEVER be committed.

   - bot_token  : the FULL token from @BotFather, including the colon,
                  e.g. "8770550259:AAFxxxxxxxxxxxxxxx-xxxxxxxxxxxxxxxxx".
   - bot_id     : the numeric part before the colon. Used for sanity
                  checks; the same number you put in src/lib/auth.jsx.
   - db_*       : credentials for the MySQL database you create in
                  cPanel -> "MySQL Databases". cPanel prepends your
                  account username to the database and user names you
                  type, e.g. you ask for `vault` and you actually get
                  `youraccount_vault`. Use those *full* names here.
   - allowed_origins : exact origins (scheme + host) the API is allowed
                       to be called from. Bare-domain only; no path,
                       no trailing slash. */

return [
    'bot_token' => 'PASTE_FULL_BOT_TOKEN_HERE',
    'bot_id'    => 8770550259,

    'db_host'   => 'localhost',
    'db_name'   => 'YOURACCOUNT_vault',
    'db_user'   => 'YOURACCOUNT_vaultuser',
    'db_pass'   => 'CHANGE_ME',

    'allowed_origins' => [
        'https://oxygenvault.online',
        'https://www.oxygenvault.online',
    ],
];
