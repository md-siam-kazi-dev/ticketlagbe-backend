const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId, Admin } = require("mongodb");
// const jose = require("jose-cjs");

require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const uri = process.env.MONOGODB_URI;
// const JWKS = jose.createRemoteJWKSet(
//   new URL("https://assignment-9-bvgd.vercel.app/api/auth/jwks"),
// );
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// const verifyToken = async (req, res, next) => {
//   const authToken = req.headers.authorization.split(" ")[1];
//   if (!authToken) {
//     return res.status(401).json({
//       msg: "Unauthoized",
//     });
//   }
//   try {
//     const { payload } = await jose.jwtVerify(authToken, JWKS);
//     console.log("ok");
//     next();
//   } catch (err) {
//     console.log(authToken);
//     return res.status(403).json({
//       msg: "forbidden",
//     });
//   }
// };

async function run() {
  try{

    const account = await client.db('account')
    const ticket = await client.db('Tickets')
    const authAccount = await client.db('TL_AUTH')

    //get admin user for manage 

    app.get('/api/admin/user',async(req,res) => {
      const data = await account.collection('user').find().toArray();
      res.send(data);
    })

    // get all ticket 

    app.get('/api/allticket',async(req,res) => {
      const data = await ticket.collection('tickets').find().toArray();
      res.send(data)
    })

    //get my ticket(vendor)

    app.get('/api/myticket/:email',async(req,res)=> {
      const email = req.params.email;
      const filter = {
        vendorEmail:email
      }
      const data = await ticket.collection('tickets').find(filter).toArray();
      res.send(data)
    })

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


    //patch admin reject or approve 


    app.patch('/api/admin/tickets',async(req,res) => {
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
      const id = req.body.id;
      const role = req.body?.role;
      const isFraud = req.body?.isFraud;

      if(isFraud){
        const makeUserAction = await account.collection('user').updateOne(
        {_id:new ObjectId(id)},
        {
          $set:{
            isBlock:true
          }
        }
      )

      const makeUserAction2 = await authAccount.collection('user').updateOne(
        {_id:new ObjectId(id)},
        // { isBlock: { $exists: false } },
        {
          $set:{
            isFraud:isFraud
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
        {_id:new ObjectId(id)},
        {
          $set:{
            role:role,
          }
        }
      )
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
