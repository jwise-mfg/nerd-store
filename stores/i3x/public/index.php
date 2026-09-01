<?php
/**
 * Document root for this store. nginx points here, and so does the built-in
 * server:  php -S localhost:8000 -t stores/i3x/public
 *
 * Which store this is comes from which directory the request arrived in --
 * style.css, brand/ and img/ beside this file are this store's own, served by
 * nginx as ordinary files with no alias and no PHP involved.
 */
$STORE_ID = 'i3x';
require dirname(__DIR__, 3) . '/lib/app.php';
