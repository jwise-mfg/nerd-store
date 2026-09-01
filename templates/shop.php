<section class="wrap">
  <h1><?= e($store['copy']['catalog_title']) ?></h1>
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
