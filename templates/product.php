<section class="wrap product">
  <div class="gallery">
    <?php
      // The product's own images are the gallery, shared by every option. A
      // variant that carries its own `images` -- a Grade B unit photographed
      // as a Grade B unit -- shows them AFTER the shared ones while it is
      // selected. They all render, so a page without JavaScript shows
      // everything; the script below hides the other options' photos.
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
      // ES5 and the 2010 DOM on purpose: this runs on a TouchPad's WebKit 534,
      // which has no classList, no dataset, no element.hidden and no e.key.
      (function () {
        var gallery = document.querySelector('.gallery');
        var all  = Array.prototype.slice.call(gallery.getElementsByTagName('img'));
        var pick = document.querySelector('.buy [name=sku]');

        function skuOf(img) { return img.getAttribute('data-sku'); }
        function setClass(el, name, on) {
          var list = el.className.split(/\s+/).filter(function (c) { return c && c !== name; });
          if (on) list.push(name);
          el.className = list.join(' ');
        }

        // Which photos belong to the chosen option: the product's shared
        // ones, then the variant's own. Other variants' photos are left out.
        function visible(sku) {
          return all.filter(function (i) { return !skuOf(i) || skuOf(i) === sku; });
        }

        // More than two photos becomes one large and a strip of thumbnails;
        // clicking a thumbnail makes it the large one. Two or fewer just stack.
        function layout(set) {
          var strip = set.length > 2;
          setClass(gallery, 'strip', strip);
          all.forEach(function (i) {
            var shown = set.indexOf(i) >= 0;
            if (shown) i.removeAttribute('hidden'); else i.setAttribute('hidden', 'hidden');
            setClass(i, 'current', false);
            i.tabIndex = strip && shown ? 0 : -1;
          });
          // Put them back in source order, then lead with the first.
          set.forEach(function (i) { gallery.appendChild(i); });
          all.forEach(function (i) { if (set.indexOf(i) < 0) gallery.appendChild(i); });
          if (strip) select(set[0]);
        }

        // The large photo is simply the first in the DOM, so no CSS ordering
        // is needed and the float layout works everywhere.
        function select(img) {
          all.forEach(function (i) { setClass(i, 'current', false); });
          setClass(img, 'current', true);
          gallery.insertBefore(img, gallery.firstChild);
        }

        gallery.addEventListener('click', function (e) {
          var t = e.target || e.srcElement;
          if (t.tagName === 'IMG' && /\bstrip\b/.test(gallery.className)) select(t);
        }, false);
        gallery.addEventListener('keydown', function (e) {
          var t = e.target || e.srcElement, k = e.keyCode || e.which;
          if ((k === 13 || k === 32) && t.tagName === 'IMG') { e.preventDefault(); select(t); }
        }, false);

        // `pick` is the <select>, or the hidden input of a single-variant
        // product. Sold out has neither, and shows the product's own photos.
        layout(visible(pick ? pick.value : ''));
        if (pick) pick.addEventListener('change', function () { layout(visible(pick.value)); }, false);
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
