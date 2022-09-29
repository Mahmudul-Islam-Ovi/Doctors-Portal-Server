const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;
// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ldzbxkz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJwt(req, res, next) {
    const authorHeader = req.headers.authorization;
    if (!authorHeader) {
        return res.status(401).send({ message: 'Unauthorized Access' });
    }
    const token = authorHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' });
        }
        req.decoded = decoded;
        next();
    })
}

async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db("doctors_portal").collection("services");
        const bookingCollection = client.db("doctors_portal").collection("booking");
        const userCollection = client.db("doctors_portal").collection("users");
        const doctorCollection = client.db("doctors_portal").collection("doctors");


        const verifyAdmin = async function (req, res, next) {
            const requester = req.decoded.email;
            const requestAccount = await userCollection.findOne({ email: requester });
            if (requestAccount.role === 'admin') {
                next();
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        }

        app.get('/service', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        });

        app.get('/user', verifyJwt, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        })

        app.put('/user/admin/:email', verifyJwt,verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        });

        app.get('/available', async (req, res) => {

            const date = req.query.date;
            const services = await serviceCollection.find().toArray();
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            services.forEach(service => {
                const serviceBooking = bookings.filter(b => b.treatment === service.name);
                const booked = serviceBooking.map(s => s.slot);
                const available = service.slots.filter(s => !booked.includes(s));
                service.slots = available;
                // service.booked = serviceBooking.map(s=> s.slot);
            })
            res.send(services);
        })

        app.get('/booking', verifyJwt, async (req, res) => {
            const patientEmail = req.query.patientEmail;
            const decodedEmail = req.decoded.email;

            if (patientEmail == decodedEmail) {

                const query = { patientEmail: patientEmail };
                const bookings = await bookingCollection.find(query).toArray();
                res.send(bookings);
            }
            else {

                return res.status(403).send({ message: 'Forbidden Access' });
            }

        });


        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = {
                treatment: booking.treatment,
                date: booking.date,
                patientEmail: booking.patientEmail
            }
            const existing = await bookingCollection.findOne(query);
            if (existing) {
                return res.send({ success: false, booking: existing });
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        });

        app.get('/doctor', verifyJwt, verifyAdmin, async (req, res) => {
            const users = await doctorCollection.find().toArray();
            res.send(users);
        });

        app.post('/doctor', verifyJwt, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        });
        app.delete('/doctor/:email', verifyJwt, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await doctorCollection.deleteOne(query);
            res.send(result);
        });

        
    }
    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('server is running')
})

app.listen(port, () => {
    console.log(`listening on port ${port}`)
})