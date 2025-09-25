const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configuration - Using sandbox mode
const MERCHANT_ID = "4b90fe3f-360f-40c6-b092-3be91e41fc99"; // Your sandbox merchant ID
const CALLBACK_URL = `http://localhost:${PORT}/api/payment-verify`; // Localhost callback
const IS_SANDBOX = true; // Set to true for sandbox mode

// In-memory storage for transaction amounts
const transactionStore = {};

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to initiate payment
app.post('/api/payment-request', async (req, res) => {
    try {
        const { amount, description, currency, mobile, email } = req.body;
        
        // Validate required fields
        if (!amount || !description) {
            return res.status(400).json({ 
                success: false, 
                message: "مبلغ و توضیحات الزامی هستند" 
            });
        }
        
        // Prepare data for Zarinpal API
        const paymentData = {
            merchant_id: MERCHANT_ID,
            amount: parseInt(amount), // Convert to integer
            description: description,
            callback_url: CALLBACK_URL,
            currency: currency || "IRT",
            metadata: {}
        };
        
        // Add optional metadata if provided
        if (mobile) paymentData.metadata.mobile = mobile;
        if (email) paymentData.metadata.email = email;
        
        // Choose the appropriate URL based on environment
        const zarinpalUrl = IS_SANDBOX 
            ? 'https://sandbox.zarinpal.com/pg/v4/payment/request.json'
            : 'https://payment.zarinpal.com/pg/v4/payment/request.json';
        
        console.log('Sending payment request to:', zarinpalUrl);
        console.log('Payment data:', paymentData);
        
        // Send request to Zarinpal
        const response = await axios.post(
            zarinpalUrl,
            paymentData,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }
        );
        
        const data = response.data;
        console.log('Zarinpal response:', data);
        
        if (data.data.code === 100) {
            // Store the amount with authority as key for verification
            transactionStore[data.data.authority] = parseInt(amount);
            console.log(`Stored transaction amount for authority ${data.data.authority}: ${amount}`);
            
            // Success - return payment URL
            const paymentUrl = IS_SANDBOX
                ? `https://sandbox.zarinpal.com/pg/StartPay/${data.data.authority}`
                : `https://payment.zarinpal.com/pg/StartPay/${data.data.authority}`;
                
            return res.json({
                success: true,
                payment_url: paymentUrl
            });
        } else {
            // Error from Zarinpal - log the actual error
            console.error('Zarinpal error:', data.errors);
            return res.status(400).json({
                success: false,
                message: data.errors?.message || "خطا در ارتباط با درگاه پرداخت",
                errors: data.errors
            });
        }
    } catch (error) {
        console.error('Payment request error:', error);
        if (error.response) {
            // Log the detailed error from Zarinpal
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
            
            return res.status(error.response.status).json({
                success: false,
                message: error.response.data.errors?.message || "خطا در ارتباط با درگاه پرداخت",
                errors: error.response.data.errors
            });
        }
        return res.status(500).json({
            success: false,
            message: "خطای داخلی سرور"
        });
    }
});

// API endpoint to verify payment (callback from Zarinpal)
app.get('/api/payment-verify', async (req, res) => {
    try {
        const { Authority, Status } = req.query;
        
        console.log('Payment verification callback:', { Authority, Status });
        
        // Check if payment was successful
        if (Status !== 'OK') {
            return res.status(400).send(`
                <html dir="rtl">
                <head>
                    <title>پرداخت ناموفق</title>
                    <style>
                        body { font-family: 'Vazirmatn', sans-serif; text-align: center; padding: 50px; }
                        .container { max-width: 500px; margin: 0 auto; padding: 20px; border-radius: 10px; background-color: #f8d7da; }
                        h1 { color: #721c24; }
                        p { margin: 20px 0; }
                        a { display: inline-block; background-color: #6c5ce7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
                        .sandbox-notice { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
                    </style>
                    <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.0/Vazirmatn-font-face.css" rel="stylesheet">
                </head>
                <body>
                    <div class="container">
                        <div class="sandbox-notice">حالت آزمایشی (سندباکس) - هیچ پرداخت واقعی انجام نشده است</div>
                        <h1>پرداخت ناموفق</h1>
                        <p>تراکنش شما لغو شد یا با خطا مواجه شد.</p>
                        <a href="/">بازگشت به صفحه اصلی</a>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Retrieve the amount from our transaction store
        const amount = transactionStore[Authority];
        if (!amount) {
            console.error(`Amount not found for authority: ${Authority}`);
            return res.status(400).send(`
                <html dir="rtl">
                <head>
                    <title>خطا در تایید پرداخت</title>
                    <style>
                        body { font-family: 'Vazirmatn', sans-serif; text-align: center; padding: 50px; }
                        .container { max-width: 500px; margin: 0 auto; padding: 20px; border-radius: 10px; background-color: #f8d7da; }
                        h1 { color: #721c24; }
                        p { margin: 20px 0; }
                        a { display: inline-block; background-color: #6c5ce7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                        .sandbox-notice { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
                    </style>
                    <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.0/Vazirmatn-font-face.css" rel="stylesheet">
                </head>
                <body>
                    <div class="container">
                        <div class="sandbox-notice">حالت آزمایشی (سندباکس) - این یک تراکنش آزمایشی است</div>
                        <h1>خطا در تایید پرداخت</h1>
                        <p>اطلاعات تراکنش یافت نشد. لطفا دوباره تلاش کنید.</p>
                        <a href="/">بازگشت به صفحه اصلی</a>
                    </div>
                </body>
                </html>
            `);
        }
        
        // Verify the payment with Zarinpal
        const verifyData = {
            merchant_id: MERCHANT_ID,
            amount: amount, // Use the retrieved amount
            authority: Authority
        };
        
        // Choose the appropriate URL based on environment
        const zarinpalVerifyUrl = IS_SANDBOX 
            ? 'https://sandbox.zarinpal.com/pg/v4/payment/verify.json'
            : 'https://payment.zarinpal.com/pg/v4/payment/verify.json';
        
        console.log('Sending verification request to:', zarinpalVerifyUrl);
        console.log('Verification data:', verifyData);
        
        const response = await axios.post(
            zarinpalVerifyUrl,
            verifyData,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }
        );
        
        const data = response.data;
        console.log('Zarinpal verification response:', data);
        
        // Clean up the transaction store
        delete transactionStore[Authority];
        console.log(`Removed transaction for authority: ${Authority}`);
        
        if (data.data.code === 100) {
            // Payment verified successfully
            return res.send(`
                <html dir="rtl">
                <head>
                    <title>پرداخت موفق</title>
                    <style>
                        body { font-family: 'Vazirmatn', sans-serif; text-align: center; padding: 50px; }
                        .container { max-width: 500px; margin: 0 auto; padding: 20px; border-radius: 10px; background-color: #d4edda; }
                        h1 { color: #155724; }
                        p { margin: 20px 0; }
                        .ref-id { font-weight: bold; font-size: 18px; color: #0c5460; }
                        a { display: inline-block; background-color: #6c5ce7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                        .sandbox-notice { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
                    </style>
                    <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.0/Vazirmatn-font-face.css" rel="stylesheet">
                </head>
                <body>
                    <div class="container">
                        <div class="sandbox-notice">حالت آزمایشی (سندباکس) - این یک تراکنش آزمایشی است</div>
                        <h1>پرداخت موفق</h1>
                        <p>پرداخت شما با موفقیت انجام شد.</p>
                        <p>کد پیگیری: <span class="ref-id">${data.data.ref_id}</span></p>
                        <p>شماره کارت: ${data.data.card_pan}</p>
                        <a href="/">بازگشت به صفحه اصلی</a>
                    </div>
                </body>
                </html>
            `);
        } else if (data.data.code === 101) {
            // Payment already verified
            return res.send(`
                <html dir="rtl">
                <head>
                    <title>پرداخت تکراری</title>
                    <style>
                        body { font-family: 'Vazirmatn', sans-serif; text-align: center; padding: 50px; }
                        .container { max-width: 500px; margin: 0 auto; padding: 20px; border-radius: 10px; background-color: #d1ecf1; }
                        h1 { color: #0c5460; }
                        p { margin: 20px 0; }
                        a { display: inline-block; background-color: #6c5ce7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                        .sandbox-notice { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
                    </style>
                    <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.0/Vazirmatn-font-face.css" rel="stylesheet">
                </head>
                <body>
                    <div class="container">
                        <div class="sandbox-notice">حالت آزمایشی (سندباکس) - این یک تراکنش آزمایشی است</div>
                        <h1>پرداخت تکراری</h1>
                        <p>این تراکنش قبلاً با موفقیت تایید شده است.</p>
                        <a href="/">بازگشت به صفحه اصلی</a>
                    </div>
                </body>
                </html>
            `);
        } else {
            // Verification failed
            return res.status(400).send(`
                <html dir="rtl">
                <head>
                    <title>خطا در تایید پرداخت</title>
                    <style>
                        body { font-family: 'Vazirmatn', sans-serif; text-align: center; padding: 50px; }
                        .container { max-width: 500px; margin: 0 auto; padding: 20px; border-radius: 10px; background-color: #f8d7da; }
                        h1 { color: #721c24; }
                        p { margin: 20px 0; }
                        a { display: inline-block; background-color: #6c5ce7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                        .sandbox-notice { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
                    </style>
                    <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.0/Vazirmatn-font-face.css" rel="stylesheet">
                </head>
                <body>
                    <div class="container">
                        <div class="sandbox-notice">حالت آزمایشی (سندباکس) - این یک تراکنش آزمایشی است</div>
                        <h1>خطا در تایید پرداخت</h1>
                        <p>خطای تایید پرداخت: ${data.errors?.message || "خطای ناشناخته"}</p>
                        <a href="/">بازگشت به صفحه اصلی</a>
                    </div>
                </body>
                </html>
            `);
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        if (error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
        }
        return res.status(500).send(`
            <html dir="rtl">
            <head>
                <title>خطای سرور</title>
                <style>
                    body { font-family: 'Vazirmatn', sans-serif; text-align: center; padding: 50px; }
                    .container { max-width: 500px; margin: 0 auto; padding: 20px; border-radius: 10px; background-color: #f8d7da; }
                    h1 { color: #721c24; }
                    p { margin: 20px 0; }
                    a { display: inline-block; background-color: #6c5ce7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                    .sandbox-notice { background-color: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
                </style>
                <link href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.0/Vazirmatn-font-face.css" rel="stylesheet">
            </head>
            <body>
                <div class="container">
                    <div class="sandbox-notice">حالت آزمایشی (سندباکس) - این یک تراکنش آزمایشی است</div>
                    <h1>خطای سرور</h1>
                    <p>خطای داخلی در تایید پرداخت. لطفا با پشتیبانی تماس بگیرید.</p>
                    <a href="/">بازگشت به صفحه اصلی</a>
                </div>
            </body>
            </html>
        `);
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Sandbox mode: ${IS_SANDBOX ? 'Enabled' : 'Disabled'}`);
    console.log(`Callback URL: ${CALLBACK_URL}`);
});