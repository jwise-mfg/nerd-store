<section class="wrap">
  <h1><?= e($store['copy']['cart_title']) ?></h1>

  <?php if ($notice): ?><p class="notice"><?= e($notice) ?></p><?php endif; ?>

  <?php if (!$lines): ?>
    <p class="empty"><?= e($store['copy']['cart_empty']) ?></p>
    <p><a class="btn" href="/"><?= e($store['copy']['hero_cta']) ?></a></p>
  <?php else: ?>
    <table class="cart">
      <tbody>
      <?php foreach ($lines as $l): ?>
        <tr>
          <td>
            <a href="/shop/<?= e($l['product']['slug']) ?>"><?= e($l['title']) ?></a>
            <?php if ($l['short'] && $l['reason'] === 'limit'): ?>
              <p class="fine warn">Limit <?= $l['limit'] ?> per order — quantity reduced.</p>
            <?php elseif ($l['short']): ?>
              <p class="fine warn">Only <?= $l['on_hand'] ?> in stock — quantity reduced.</p>
            <?php endif; ?>
          </td>
          <td class="qty">
            <form method="post" action="/cart">
              <input type="hidden" name="action" value="set">
              <input type="hidden" name="sku" value="<?= e($l['sku']) ?>">
              <input type="number" name="qty" value="<?= $l['qty'] ?>" min="0" max="<?= $l['allowed'] ?>"
                     inputmode="numeric" onchange="this.form.submit()">
              <noscript><button type="submit">Update</button></noscript>
            </form>
          </td>
          <td class="num"><?= money($l['line_cents']) ?></td>
          <td>
            <form method="post" action="/cart">
              <input type="hidden" name="action" value="set">
              <input type="hidden" name="sku" value="<?= e($l['sku']) ?>">
              <input type="hidden" name="qty" value="0">
              <button class="link" type="submit" aria-label="Remove <?= e($l['title']) ?>">Remove</button>
            </form>
          </td>
        </tr>
      <?php endforeach; ?>
      </tbody>
      <tfoot>
        <tr><th colspan="2">Subtotal</th><td class="num"><?= money($subtotal) ?></td><td></td></tr>
      </tfoot>
    </table>

    <p class="fine">Shipping is chosen at checkout. <?= e($store['copy']['shipping_restriction']) ?></p>

    <form method="post" action="/checkout">
      <button class="btn" type="submit"><?= e($store['copy']['checkout_title']) ?></button>
    </form>
    <p class="fine"><?= e($store['copy']['checkout_reassurance']) ?></p>
  <?php endif; ?>
</section>
