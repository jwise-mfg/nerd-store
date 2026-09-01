<section class="hero">
  <p class="tagline"><?= e($store['copy']['tagline']) ?></p>
  <h1><?= e($store['copy']['hero_title']) ?></h1>
  <p class="lede"><?= e($store['copy']['hero_body']) ?></p>
  <a class="btn" href="/shop"><?= e($store['copy']['hero_cta']) ?></a>
</section>

<?php if ($featured): ?>
<section class="wrap">
  <div class="grid">
    <?php foreach ($featured as $p): ?>
      <?= view('card', ['store' => $store, 'p' => $p, 'stock' => $stock]) ?>
    <?php endforeach; ?>
  </div>
</section>
<?php endif; ?>
