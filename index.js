const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
 const jose = require("jose-cjs");

require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const uri = process.env.MONOGODB_URI;
 const JWKS = jose.createRemoteJWKSet(
   new URL("http://localhost:3000/api/auth/jwks"),
 );
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = async (req, res, next) => {
  
  
  
  const authToken =await req.headers.authorization.split(" ")[1];
  console.log(authToken)
  if (!authToken) {
    return res.status(401).json({
      msg: "Unauthoized",
    });
  }
  try {
    const { payload } = await jose.jwtVerify(authToken, JWKS);
    console.log("ok");
    next();
  } catch (err) {
    console.log(authToken);
    return res.status(403).json({
      msg: "forbidden",
    });
  }
};

async function run() {
  try{

    const account = await client.db('account')
    const ticket = await client.db('Tickets')
    const authAccount = await client.db('TL_AUTH')

    //get admin user for manage 

    app.get('/api/admin/user',verifyToken,async(req,res) => {
      const data = await account.collection('user').find().toArray();
      res.send(data);
    })

    // get all ticket 

    app.get('/api/allticket',async(req,res) => {
      const data = await ticket.collection('tickets').find().toArray();
      res.send(data)
    })

    //get admin overview 
    app.get('/api/admin/overview',verifyToken, async (req, res) => {
    try {
    const [
      totalTickets,
      pendingTickets,
      activeTickets,
      rejectedTickets,
      totalAccount,
      totalUser,
      totalVendor,
      totalAdmin,
    ] = await Promise.all([
      ticket.collection('tickets').countDocuments(),
      ticket.collection('tickets').countDocuments({ verificationStatus: 'pending' }),
      ticket.collection('tickets').countDocuments({ verificationStatus: 'approved' }),
      ticket.collection('tickets').countDocuments({ verificationStatus: 'rejected' }),
      account.collection('user').countDocuments( {role: { $ne: 'admin' }}),
      account.collection('user').countDocuments({ role: 'user',   isBlock: false }),
      account.collection('user').countDocuments({ role: 'vendor', isBlock: false }),
      account.collection('user').countDocuments({ isBlock: true }),
    ]);

    res.status(200).json({
      totalTickets,
      pendingTickets,
      activeTickets,
      rejectedTickets,
      totalAccount,
      totalUser,
      totalVendor,
      totalAdmin,
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

    //get my ticket(vendor)

    app.get('/api/myticket/:email',async(req,res)=> {
      const email = req.params.email;
      const filter = {
        vendorEmail:email
      }
      const data = await ticket.collection('tickets').find(filter).toArray();
      res.send(data)
    })

    // GET /api/getuser/:email
app.get('/api/getuser/:email',verifyToken, async (req, res) => {
  try {
    const { email } = req.params;
    const user = await account.collection('user').findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH /api/admin/getuser
app.patch('/api/admin/getuser', async (req, res) => {
  
  try {
    const { email, name, img } = req.body;
    
    const result = await account.collection('user').updateOne(
      { email },
      { $set: { name, img, updatedAt: new Date().toISOString() } },
      
    );
    console.log(email)
    if (!result) return res.status(404).json({ message: 'User not found' });
    res.status(200).json(result);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

    // post user new account 
    app.post('/api/account',async(req,res) => {

        const body = req.body;
        
        const user = {
            ...body,
            isBlock: false,
            img:'',
            userInfo : {
               bookedTickets:[],
               transectionHistory:[]

            },
            vendorInfo:{
                addedTickets:[],
                requestedBooking:[],
                soldTickets:[]
            }
        }
        //console.log(user)
        const msg = await account.collection('user').insertOne(user);
        console.log(msg)

    })



    //post new tickets

    app.post('/api/ticket',async(req  ,res) => {

      const msg = await ticket.collection('tickets').insertOne(req.body)
      res.send(msg?.acknowledged)
      

    })


    // PATCH /api/ticket/:id  →  Update a ticket
    app.patch('/api/ticket', async (req, res) => {
      
      const updatedData = req.body

      const result = await ticket.collection('tickets').updateOne(
        { _id: new ObjectId(req.body.id) },
        { $set: updatedData }
      )

      res.send(result)
    })

    // DELETE /api/ticket/:id  →  Delete a ticket
    app.delete('/api/ticket/:id', async (req, res) => {
      const id = req.params.id

      const result = await ticket.collection('tickets').deleteOne(
        { _id: new ObjectId(id) }
      )

      res.send(result)
    })

    //patch updatad ticket data from vendor


    //patch admin reject or approve 


    app.patch('/api/admin/tickets',verifyToken,async(req,res) => {
       const status = req.body.verificationStatus
       const id = req.body.id;
       const msg = await ticket.collection('tickets').updateOne(
        { _id:new ObjectId(id)},
        {
          $set:{
            verificationStatus:status
          }
        }
       )
       console.log(msg)
    })

    // patch user role by Admin 
    app.patch('/api/admin/users',async (req,res) => {
      const id = req.body?.id;
      const role = req.body?.role;
      const isFraud = req.body?.isFraud;
      const email = req.body?.email
      console.log(req.body)

      if(isFraud){
        const makeUserAction = await account.collection('user').updateOne(
        {_id:new ObjectId(id)},
        {
          $set:{
            isBlock:true
          }
        }
        
      )
      const user = await account.collection('user').findOne({
          _id:new ObjectId(id)
        })
      
      await ticket.collection('tickets').deleteMany({
        vendorEmail:user.email
      })

      const makeUserAction2 = await authAccount.collection('user').updateOne(
        {email:email},
        // { isBlock: { $exists: false } },
        {
          $set:{
            isFraud:true,
          }
        }
      )
      res.send(makeUserAction)

      }else if(role){
        const makeUserAction = await account.collection('user').updateOne(
        {_id:new ObjectId(id)},
        {
          $set:{
            role:role,
          }
        }
      )

      const makeUserAction2 = await authAccount.collection('user').updateOne(
        {email:email},
        {
          $set:{
            role:role,
          }
        }
      )
      console.log(makeUserAction2,id,role,email)
      res.send(makeUserAction)
      }

      
    })

  }
  finally{

  }
}
run()

app.get("/", (req, res) => {
  res.send([
    {
      msg:'your api is working'
    }
  ]);
});

app.listen(5000,() => {
  console.log('running')
})
//Running server

module.exports = app
