<?php
$img   = first_image($p);
$prices = array_map(fn($v) => to_cents($v['price']), $p['variants']);
$onhand = array_sum(array_map(fn($v) => (int) ($stock[$v['sku']] ?? 0), $p['variants']));
?>
<a class="product-card" href="/shop/<?= e($p['slug']) ?>">
  <?php if ($img): ?>
    <img src="<?= e($img['url']) ?>" alt="<?= e($img['alt']) ?>" loading="lazy">
  <?php endif; ?>
  <div class="card-body">
    <h3><?= e($p['title']) ?></h3>
    <?php if (!empty($p['subtitle'])): ?><p class="sub"><?= e($p['subtitle']) ?></p><?php endif; ?>
    <p class="price">
      <?php if ($onhand === 0): ?>
        <span class="sold"><?= e($store['copy']['sold_out']) ?></span>
      <?php else: ?>
        <?= count($prices) > 1 ? 'From ' . money(min($prices)) : money($prices[0]) ?>
        <?php if ($onhand <= ($store['scarcity_threshold'] ?? 3)): ?>
          <span class="scarce"><?= $onhand === 1 ? e($store['copy']['last_one']) : "Only $onhand left" ?></span>
        <?php endif; ?>
      <?php endif; ?>
    </p>
  </div>
</a>
