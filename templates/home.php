<section class="hero">
  <p class="tagline"><?= e($store['copy']['tagline']) ?></p>
  <h1><?= e($store['copy']['hero_title']) ?></h1>
  <p class="lede"><?= e($store['copy']['hero_body']) ?></p>
  <?php // The catalogue is right below, so this scrolls rather than navigates. ?>
  <a class="btn" href="#catalogue"><?= e($store['copy']['hero_cta']) ?></a>
</section>

<section class="wrap" id="catalogue">
  <h2><?= e($store['copy']['catalog_title']) ?></h2>
  <?php if (!$items): ?>
    <p class="empty"><?= e($store['copy']['catalog_empty']) ?></p>
  <?php else: ?>
    <div class="grid">
      <?php foreach ($items as $p): ?>
        <?= view('card', ['store' => $store, 'p' => $p, 'stock' => $stock]) ?>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
</section>
