<section class="wrap product">
  <div class="gallery">
    <?php
      // The product's own images are the gallery. A variant that carries its
      // own `images` shows those INSTEAD when it is selected -- a Grade B unit
      // photographed as a Grade B unit. They all render, so a page without
      // JavaScript shows everything; the script below hides what is not
      // relevant to the chosen option.
    ?>
    <?php foreach (($p['images'] ?? []) as $img): ?>
      <img src="<?= e(image_url($p['slug'], $img['file'])) ?>" alt="<?= e($img['alt'] ?? '') ?>">
    <?php endforeach; ?>
    <?php foreach ($p['variants'] as $v): foreach ($v['images'] ?? [] as $img): ?>
      <img src="<?= e(image_url($p['slug'], $img['file'])) ?>" alt="<?= e($img['alt'] ?? '') ?>" data-sku="<?= e($v['sku']) ?>" loading="lazy">
    <?php endforeach; endforeach; ?>
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
          <?php if (!empty($v['conditionNotes'])): ?>
            <p class="fine"><?= e($v['conditionNotes']) ?></p>
          <?php endif; ?>
        </div>
      <?php endif; ?>
    <?php endforeach; ?>

    <p class="fine"><?= e($store['copy']['shipping_restriction']) ?></p>

    <script>
      (function () {
        var gallery = document.querySelector('.gallery');
        var own = gallery.querySelectorAll('img[data-sku]');
        if (!own.length) return;
        var shared = gallery.querySelectorAll('img:not([data-sku])');
        var pick = document.querySelector('.buy [name=sku]');
        function show(sku) {
          var has = gallery.querySelector('img[data-sku="' + sku + '"]');
          shared.forEach(function (i) { i.hidden = !!has; });
          own.forEach(function (i) { i.hidden = i.dataset.sku !== sku; });
        }
        if (pick) {
          show(pick.value);
          pick.addEventListener('change', function () { show(pick.value); });
        } else {
          own.forEach(function (i) { i.hidden = true; });
        }
      })();
    </script>

    <?php if ($show_stock): ?>
      <table class="cart stock">
        <thead><tr><th>SKU</th><th>Variant</th><th class="num">On hand</th></tr></thead>
        <tbody>
        <?php foreach ($p['variants'] as $v): ?>
          <tr>
            <td><code><?= e($v['sku']) ?></code></td>
            <td><?= e($v['title']) ?></td>
            <td class="num"><?= (int) ($stock[$v['sku']] ?? 0) ?></td>
          </tr>
        <?php endforeach; ?>
        </tbody>
      </table>
    <?php endif; ?>
  </div>
</section>
