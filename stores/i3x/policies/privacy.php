<h1>Privacy</h1>
<p><?= e($store['name']) ?> collects only what is needed to take an order and ship
   it: your email address, shipping address, and the contents of your order.</p>
<p><strong>Payments.</strong> Checkout hands you to a payment page hosted by Stripe,
   our payment processor, and your card details are entered there.
   <?= e($store['name']) ?> never receives or stores your card number. Stripe sends
   your payment receipt and returns us your email and shipping address so we can
   post the order.</p>
<p><strong>Email.</strong> Your address is used for the payment receipt and for the
   notice telling you the order has shipped. We do not send marketing email and we
   do not sell or share your details.</p>
<p><strong>Cookies.</strong> One cookie, <code><?= e($store['cart_cookie']) ?></code>,
   remembers your cart. It contains a random identifier and nothing else.
   <?= $store['analytics_domain']
        ? 'Aggregate, cookie-free traffic statistics are collected for this site only.'
        : '' ?>
   <?= $store['body_end_html']
        ? 'This site also loads HubSpot’s tracking script, which sets its own cookies to measure visits; see HubSpot’s privacy policy for what it collects.'
        : 'This site runs no analytics or tracking scripts.' ?></p>
<p>To have your order data deleted, email
   <a href="mailto:<?= e($store['support_email']) ?>"><?= e($store['support_email']) ?></a>.
   We retain order records for as long as tax law requires and no longer.</p>
