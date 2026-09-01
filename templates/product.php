<section class="wrap product">
  <div class="gallery">
    <?php foreach (($p['images'] ?? []) as $img): ?>
      <img src="<?= e(image_url($p['slug'], $img['file'])) ?>" alt="<?= e($img['alt'] ?? '') ?>">
    <?php endforeach; ?>
  </div>

  <div class="detail">
    <h1><?= e($p['title']) ?></h1>
    <?php if (!empty($p['subtitle'])): ?><p class="sub"><?= e($p['subtitle']) ?></p><?php endif; ?>

    <div class="prose"><?= description_html($p) ?></div>

    <form method="post" action="/cart" class="buy">
      <input type="hidden" name="action" value="add">
      <?php $available = array_filter($p['variants'], fn($v) => (int) ($stock[$v['sku']] ?? 0) > 0); ?>

      <?php if (!$available): ?>
        <p class="sold"><?= e($store['copy']['sold_out']) ?></p>
      <?php else: ?>
        <?php if (count($p['variants']) > 1): ?>
          <label>Option
            <select name="sku">
              <?php foreach ($p['variants'] as $v): $n = (int) ($stock[$v['sku']] ?? 0); ?>
                <option value="<?= e($v['sku']) ?>"<?= $n === 0 ? ' disabled' : '' ?>>
                  <?= e($v['title']) ?> — <?= money(to_cents($v['price'])) ?><?= $n === 0 ? ' (' . e($store['copy']['sold_out']) . ')' : '' ?>
                </option>
              <?php endforeach; ?>
            </select>
          </label>
        <?php else: $v = $p['variants'][0]; ?>
          <input type="hidden" name="sku" value="<?= e($v['sku']) ?>">
          <p class="price"><?= money(to_cents($v['price'])) ?></p>
        <?php endif; ?>

        <?php
          // One box for every variant, so this is the most any of them allows;
          // the cart re-checks the exact SKU and says so if it has to reduce.
          $ceiling = min(order_max($p), max(array_map(fn($v) => (int) ($stock[$v['sku']] ?? 0), $available)));
        ?>
        <label>Qty <input type="number" name="qty" value="1" min="1" max="<?= $ceiling ?>" inputmode="numeric"></label>
        <?php if (order_max($p) < 99): ?>
          <p class="fine">Limit <?= order_max($p) ?> per order.</p>
        <?php endif; ?>
        <button class="btn" type="submit">Add to cart</button>
      <?php endif; ?>
    </form>

    <?php foreach ($p['variants'] as $v): ?>
      <?php if (!empty($v['condition']) && ($store['show_condition_detail'] ?? false)): ?>
        <div class="condition">
          <span class="grade"><?= e(str_replace('_', ' ', $v['condition'])) ?></span>
          <strong><?= e($v['title']) ?></strong>
          <?php if (!empty($v['serial'])): ?><span class="fine">S/N <?= e($v['serial']) ?></span><?php endif; ?>
          <?php if (!empty($v['condition_notes'] ?? $v['conditionNotes'] ?? null)): ?>
            <p class="fine"><?= e($v['condition_notes'] ?? $v['conditionNotes']) ?></p>
          <?php endif; ?>
        </div>
      <?php endif; ?>
    <?php endforeach; ?>

    <p class="fine"><?= e($store['copy']['shipping_restriction']) ?></p>
  </div>
</section>
