<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($store['name']) ?> · <?= e($title) ?></title>
<?php
  // Link previews. Every page gets these so a shared cart or policy link
  // still shows the shop's name and picture rather than a bare URL.
  $ogTitle = $meta['title'] ?? ($title . ' · ' . $store['name']);
  $ogDesc  = $meta['description'] ?? $store['copy']['hero_body'];
  $ogImage = $meta['image'] ?? (($s = $store['brand']['social_image'] ?? null) ? $store['origin'] . $s : null);
  $ogUrl   = $meta['url'] ?? null;
?>
<meta property="og:site_name" content="<?= e($store['name']) ?>">
<meta property="og:type" content="<?= e($meta['type'] ?? 'website') ?>">
<meta property="og:title" content="<?= e($ogTitle) ?>">
<meta property="og:description" content="<?= e($ogDesc) ?>">
<meta name="description" content="<?= e($ogDesc) ?>">
<?php if ($ogUrl): ?>
<meta property="og:url" content="<?= e($ogUrl) ?>">
<link rel="canonical" href="<?= e($ogUrl) ?>">
<?php endif; ?>
<?php if ($ogImage): ?>
<meta property="og:image" content="<?= e($ogImage) ?>">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="<?= e($ogImage) ?>">
<?php else: ?>
<meta name="twitter:card" content="summary">
<?php endif; ?>
<meta name="twitter:title" content="<?= e($ogTitle) ?>">
<meta name="twitter:description" content="<?= e($ogDesc) ?>">
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
<?php
  // A store that sits under its parent site's menu bar (config: site_menu)
  // gets that bar first, and its own masthead then carries no logo -- the bar
  // above already says whose shop this is, so the masthead is only the shop's
  // links, right-aligned. See site_menu() in lib/render.php.
  $underSiteMenu = !empty($store['site_menu']);
?>
<?php if ($underSiteMenu && ($menu = site_menu($store))): ?>
<div id="site-menu"><?= $menu ?></div>
<?php endif; ?>
<header class="masthead<?= $underSiteMenu ? ' no-brand' : '' ?>">
  <?php if (!$underSiteMenu): ?>
  <a class="brand" href="/">
    <?php if ($w = $store['brand']['wordmark'] ?? null): ?>
      <img src="<?= e($w) ?>" alt="<?= e($store['brand']['wordmark_alt'] ?? $store['name']) ?>"
           style="height:<?= e($store['brand']['wordmark_height'] ?? '30px') ?>">
    <?php else: ?>
      <span class="wordmark"><?= e($store['name']) ?></span>
    <?php endif; ?>
  </a>
  <?php endif; ?>
  <nav>
    <?php
      // The item whose href is exactly this request -- "/" or "/?kind=device" --
      // is marked current so the stylesheet can colour it. External links
      // never match. Links into this shop are .section, so a narrow screen
      // can drop them and keep only the logo, the parent site and the cart.
      $here = $_SERVER['REQUEST_URI'] ?? '/';
    ?>
    <?php foreach ($store['nav'] as $item): ?>
      <a href="<?= e($item['href']) ?>"<?= $item['href'][0] === '/' ? ' class="section"' : '' ?><?= $item['href'] === $here ? ' aria-current="page"' : '' ?>><?= e($item['label']) ?></a>
    <?php endforeach; ?>
    <a class="cart-link" href="/cart">Cart<?php if ($n = cart_count()): ?> <span class="pill"><?= $n ?></span><?php endif; ?></a>
  </nav>
</header>

<main><?= $body ?></main>

<footer>
  <p><?= e($store['copy']['footer_blurb']) ?></p>
  <p class="fine">
    <a href="/policies/returns"><?= e($store['copy']['returns_link'] ?? 'Returns') ?></a> ·
    <a href="/policies/privacy">Privacy</a> ·
    <a href="mailto:<?= e($store['support_email']) ?>"><?= e($store['support_email']) ?></a>
  </p>
  <p class="fine"><?= e($store['name']) ?> — <?= e($store['postal_address']) ?></p>
</footer>
<?php
  // Raw HTML from the store's config, unescaped: third-party snippets that
  // want to sit just before </body>. Null on a store that has none.
  echo $store['body_end_html'] ?? '';
?>
</body>
</html>
