<section class="wrap narrow">
<?php
  // Reaching this page means Stripe already took the payment -- it is the
  // success_url, and Stripe only sends a buyer here once the card has cleared.
  // A pending order therefore means the confirmation has not reached us yet,
  // not that anything is wrong with the payment.
  $waiting = time() - (int) $order['created_at'];
?>
<?php if ($order['status'] === 'pending' && $waiting < 120): ?>
  <h1>Confirming your payment</h1>
  <p>Order <strong><?= e($order['number']) ?></strong> is being confirmed by our payment
     processor. This usually takes a few seconds.</p>
  <p class="fine">This page refreshes itself. Nothing further is needed from you.</p>
  <meta http-equiv="refresh" content="5">
<?php elseif ($order['status'] === 'pending'): ?>
  <?php // Two minutes in, refreshing is no longer telling them anything. ?>
  <h1>Your order is placed</h1>
  <p>Order <strong><?= e($order['number']) ?></strong>. Your payment went through —
     it is our confirmation that is running late, which happens occasionally and
     sorts itself out.</p>
  <p><strong>You do not need to pay again or order again.</strong> We will email you
     as soon as it lands, and your card statement is the record in the meantime.</p>
  <p class="fine">If you would rather hear from a person, email
     <a href="mailto:<?= e($store['support_email']) ?>"><?= e($store['support_email']) ?></a>
     quoting <?= e($order['number']) ?> and we will confirm it by hand.</p>
<?php else: ?>
  <h1><?= e($store['copy']['order_confirmed_title']) ?></h1>
  <p><?= e($store['copy']['order_confirmed_body']) ?></p>
  <p>Order <strong><?= e($order['number']) ?></strong></p>
<?php endif; ?>

  <table class="cart">
    <tbody>
    <?php foreach ($items as $i): ?>
      <tr>
        <td><?= $i['qty'] ?> × <?= e($i['title']) ?>
          <?php if (!empty($i['serial'])): ?><span class="fine">S/N <?= e($i['serial']) ?></span><?php endif; ?>
        </td>
        <td class="num"><?= money($i['qty'] * $i['unit_cents']) ?></td>
      </tr>
    <?php endforeach; ?>
    </tbody>
    <tfoot>
      <tr><th>Subtotal</th><td class="num"><?= money((int) $order['subtotal_cents']) ?></td></tr>
      <tr><th>Shipping</th><td class="num"><?= money((int) $order['shipping_cents']) ?></td></tr>
      <tr><th>Total</th><td class="num"><?= money((int) $order['total_cents']) ?></td></tr>
    </tfoot>
  </table>

<?php if ($order['ship_line1']): ?>
  <h2>Shipping to</h2>
  <p class="address"><?= nl2br(e(address_block($order))) ?></p>
<?php endif; ?>

<?php if ($order['status'] === 'shipped'): ?>
  <h2>Shipped</h2>
  <p><?= e($order['carrier']) ?>
    <?php if ($url = tracking_url($order['carrier'], $order['tracking'])): ?>
      — <a href="<?= e($url) ?>"><?= e($order['tracking']) ?></a>
    <?php elseif ($order['tracking']): ?>
      — <?= e($order['tracking']) ?>
    <?php endif; ?>
  </p>
<?php endif; ?>

  <p class="fine">Your card statement will show “<?= e($store['statement_suffix']) ?>”.</p>
  <p class="fine">Questions: <a href="mailto:<?= e($store['support_email']) ?>"><?= e($store['support_email']) ?></a></p>
</section>
