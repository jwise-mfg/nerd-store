<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($title) ?> · <?= e($store['name']) ?></title>
<?php if ($f = $store['brand']['favicon'] ?? null): ?>
<link rel="icon" href="<?= e($f) ?>">
<?php endif; ?>
<?php if ($f = $store['brand']['apple_touch_icon'] ?? null): ?>
<link rel="apple-touch-icon" href="<?= e($f) ?>">
<?php endif; ?>
<?php if ($h = $store['font_href'] ?? null): ?>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="<?= e($h) ?>">
<?php endif; ?>
<link rel="stylesheet" href="/base.css<?= asset_version(base_dir() . '/assets/base.css') ?>">
<link rel="stylesheet" href="/style.css<?= asset_version($store['dir'] . '/public/style.css') ?>">
<?php if ($d = $store['analytics_domain'] ?? null): ?>
<script defer data-domain="<?= e($d) ?>" src="https://plausible.io/js/script.js"></script>
<?php endif; ?>
</head>
<body>
<header class="masthead">
  <a class="brand" href="/">
    <?php if ($w = $store['brand']['wordmark'] ?? null): ?>
      <img src="<?= e($w) ?>" alt="<?= e($store['brand']['wordmark_alt'] ?? $store['name']) ?>"
           style="height:<?= e($store['brand']['wordmark_height'] ?? '30px') ?>">
    <?php else: ?>
      <span class="wordmark"><?= e($store['name']) ?></span>
    <?php endif; ?>
  </a>
  <nav>
    <?php foreach ($store['nav'] as $item): ?>
      <a href="<?= e($item['href']) ?>"><?= e($item['label']) ?></a>
    <?php endforeach; ?>
    <a class="cart-link" href="/cart">Cart<?php if ($n = cart_count()): ?> <span class="pill"><?= $n ?></span><?php endif; ?></a>
  </nav>
</header>

<main><?= $body ?></main>

<footer>
  <p><?= e($store['copy']['footer_blurb']) ?></p>
  <p class="fine">
    <a href="/policies/returns">Returns</a> ·
    <a href="/policies/privacy">Privacy</a> ·
    <a href="mailto:<?= e($store['support_email']) ?>"><?= e($store['support_email']) ?></a>
  </p>
  <p class="fine"><?= e($store['name']) ?> — <?= e($store['postal_address']) ?></p>
</footer>
</body>
</html>
