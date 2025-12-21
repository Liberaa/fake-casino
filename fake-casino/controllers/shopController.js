const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const User = require('../models/User')

const PACKAGES = {
  mini: { coins: 1000, price: 0.99, name: 'Mini Pack' },
  starter: { coins: 2500, price: 1.99, name: 'Starter Pack' },
  popular: { coins: 5500, price: 4.99, name: 'Popular Pack' },
  premium: { coins: 17000, price: 9.99, name: 'Premium Pack' },
  mega: { coins: 60000, price: 19.99, name: 'Mega Pack' },
  ultimate: { coins: 125000, price: 49.99, name: 'Ultimate Pack' }
}

exports.createCheckout = async (req, res) => {
  try {
    const { packageName } = req.body
    const userId = req.session.userId

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' })
    }

    const pkg = PACKAGES[packageName]
    if (!pkg) {
      return res.status(400).json({ success: false, message: 'Invalid package' })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: pkg.name,
              description: `${pkg.coins.toLocaleString()} Brap Coins`,
              images: ['https://i.imgur.com/EHyR2nP.png']
            },
            unit_amount: Math.round(pkg.price * 100)
          },
          quantity: 1
        }
      ],
      mode: 'payment',
      success_url: `${process.env.BASE_URL}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/shop`,
      metadata: {
        userId: userId,
        packageName: packageName,
        coins: pkg.coins.toString()
      }
    })

    res.json({ success: true, url: session.url })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    res.status(500).json({ success: false, message: 'Failed to create checkout session' })
  }
}

exports.handleSuccess = async (req, res) => {
  try {
    const { session_id } = req.query

    if (!session_id) {
      return res.redirect('/shop')
    }

    const session = await stripe.checkout.sessions.retrieve(session_id)

    if (session.payment_status === 'paid') {
      const userId = session.metadata.userId
      const coins = parseInt(session.metadata.coins)

      await User.findByIdAndUpdate(userId, {
        $inc: { credits: coins }
      })

      const user = await User.findById(req.session.userId)
      res.render('shop-success', { user, coins, session })
    } else {
      res.redirect('/shop')
    }
  } catch (error) {
    console.error('Success page error:', error)
    res.redirect('/shop')
  }
}