// server.js

require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.static('.'));
app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
    const { cart } = req.body;

    const line_items = cart.map(item => {
        return {
            price_data: {
                currency: 'egp',
                product_data: {
                    name: item.name,
                },
                unit_amount: item.price * 100,
            },
            quantity: item.quantity,
        };
    });

    const subtotal = cart.reduce((total, item) => total + (item.price * item.quantity), 0);
    if (subtotal > 0) {
        line_items.push({
            price_data: {
                currency: 'egp',
                product_data: {
                    name: 'Shipping',
                },
                unit_amount: 50 * 100,
            },
            quantity: 1,
        });
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: line_items,
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/success.html`,
            cancel_url: `${req.protocol}://${req.get('host')}/cancel.html`,
        });
        res.json({ id: session.id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));