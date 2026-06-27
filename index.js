

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
  new URL("https://ticketbookplatform.vercel.app/api/auth/jwks"),
);
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  const authToken = authHeader.split(" ")[1];
  if (!authToken) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  try {
    const { payload } = await jose.jwtVerify(authToken, JWKS);
    console.log("ok");
    next();
  } catch (err) {
    console.log(authToken);
    return res.status(403).json({ msg: "forbidden" });
  }
};

async function run() {
  try {
    const ticket = await client.db("Tickets");
    const authAccount = await client.db("TL_AUTH"); // Replaced account db with authAccount

    // get admin user for manage
    app.get("/api/admin/user", verifyToken, async (req, res) => {
      const data = await authAccount.collection("user").find().toArray();
      res.send(data);
    });

    app.get("/api/allticketpag", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      console.log(req.query);
      const skip = (page - 1) * 6;
      const sortMap = {
        asc: { price: 1 },
        desc: { price: -1 },
        none: {},
      };
      const data = await ticket
        .collection("tickets")
        .find({
          verificationStatus: "approved",
          to: {
            $regex: req.query.to,
            $options: "i",
          },
          from: {
            $regex: req.query.from,
            $options: "i",
          },
          transportType: {
            $regex: req.query.type,
            $options: "i",
          },
        })
        .sort(sortMap[req.query.sort])
        .skip(skip)
        .limit(6)
        .toArray();
      const totalTicket = await ticket.collection("tickets").countDocuments({
        verificationStatus: "approved",
        to: {
          $regex: req.query.to,
          $options: "i",
        },
        from: {
          $regex: req.query.from,
          $options: "i",
        },
        transportType: {
          $regex: req.query.type,
          $options: "i",
        },
      });

      res.send({
        tickets: data,
        totalTicket,
        currentPage: page,
        totalPage: Math.ceil(totalTicket / 6),
      });
    });

    // get all ticket
    app.get("/api/allticket/ad", async (req, res) => {
      const data = await ticket
        .collection("tickets")
        .find({
          verificationStatus: "approved",
        })
        .toArray();
      res.send(data);
    });

    // get admin overview
    app.get("/api/admin/overview", verifyToken, async (req, res) => {
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
          ticket.collection("tickets").countDocuments(),
          ticket
            .collection("tickets")
            .countDocuments({ verificationStatus: "pending" }),
          ticket
            .collection("tickets")
            .countDocuments({ verificationStatus: "approved" }),
          ticket
            .collection("tickets")
            .countDocuments({ verificationStatus: "rejected" }),
          authAccount
            .collection("user")
            .countDocuments({ role: { $ne: "admin" } }),
          authAccount
            .collection("user")
            .countDocuments({ role: "user", isBlock: false }),
          authAccount
            .collection("user")
            .countDocuments({ role: "vendor", isBlock: false }),
          authAccount.collection("user").countDocuments({ isBlock: true }),
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
        console.error("Admin overview error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    app.get("/api/tickets/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const ticketInfo = await ticket
        .collection("tickets")
        .find({
          verificationStatus: "approved",
          _id: new ObjectId(id),
        })
        .toArray();
      console.log(ticketInfo);
      res.send(ticketInfo);
    });

    // get ad ticket

    app.get("/api/adticket", async (req, res) => {
      const data = await ticket
        .collection("tickets")
        .find({
          isAd: true,
        })
        .toArray();
      res.send(data);
    });

    // get my ticket(vendor)
    app.get("/api/myticket/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { vendorEmail: email };
      const data = await ticket.collection("tickets").find(filter).toArray();
      res.send(data);
    });

    // get approved ticket for ad

    app.get("/api/allticket", async (req, res) => {
      const data = await ticket.collection("tickets").find().toArray();
      console.log(data);
      res.send(data);
    });

    // GET /api/getuser/:email
    app.get("/api/getuser/:email", verifyToken, async (req, res) => {
      try {
        const { email } = req.params;
        const user = await authAccount.collection("user").findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });
        res.status(200).json(user);
      } catch (error) {
        console.error("Get user error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });
    //patch ticket toggling

    app.patch("/api/ticket/ad", async (req, res) => {
      const msg = await ticket.collection("tickets").updateOne(
        { _id: new ObjectId(req.body.id) },
        {
          $set: {
            isAd: req.body.isAd,
          },
        },
      );
      if (msg.modifiedCount === 1) {
        res.send({
          success: true,
        });
      }
    });

    // post ticket booking

    app.post("/api/bookings", verifyToken, async (req, res) => {
      console.log(req.body);
      const quantity = req.body.quantity;

      const msg = await ticket.collection("booking").insertOne(req.body);
      const operateSeats = await ticket.collection("tickets").updateOne(
        { _id: new ObjectId(req.body.ticketId), quantity: { $gt: 0 } },
        {
          $inc: {
            quantity: -quantity,
            totalSold: quantity,
          },
        },
      );
      console.log(operateSeats);
      res.send(msg);
    });

    app.get("/api/bookings/:email", verifyToken, async (req, res) => {
      const result = await ticket
        .collection("booking")
        .find({
          email: req.params.email,
        })
        .toArray();
      res.send(result);
    });

    app.patch("/api/paidbooking", verifyToken, async (req, res) => {
      const isPaidTicket = await ticket.collection("booking").findOne({
        _id: new ObjectId(req.body.bookingId),
      });
      console.log(isPaidTicket);

      if (!isPaidTicket.isPaid) {
        const msg = await ticket.collection("booking").updateOne(
          { _id: new ObjectId(req.body.bookingId) },
          {
            $set: {
              isPaid: true,
              transactionId: req.body.transactionId,
              paymentDate: new Date(),
            },
          },
        );
        console.log(msg);
        res.send(msg);
      } else {
        console.log("already paid");
        res.send({
          msg: "already paid",
        });
      }
    });

    app.get('/api/vendor/rev/:email',verifyToken,async(req,res) =>{
       const data = await ticket.collection('booking').find({
         vendorEmail:req.params.email,
         isPaid:true,
       }).toArray();
       res.send(data)
    })

    app.get("/api/user/stats/:email", verifyToken, async (req, res) => {
      const email = req.params.email
      const [
        totalBookings,
        pendingReview,
        approvedPaid,
        rejectedCount,
        totalSpent,
        pendingPay,
        totalSeats,
      ] =await Promise.all([
        ticket.collection("booking").countDocuments({
          email: email,
        }),
        ticket.collection("booking").countDocuments({
          email: email,
          status: "pending",
        }),
        ticket.collection("booking").countDocuments({
          email: email,
          status: "accepted",
        }),
        ticket.collection("booking").countDocuments({
          email: email,
          status: "rejected",
        }),
        ticket.collection("booking").aggregate([
          {
            $match: {
              email: email,
              isPaid: true,
            },
          },
          {
            $group: {
              _id: null,
              totalSpent: {
                $sum: {
                  $multiply: ["$price", "$quantity"],
                },
              },
            },
          },
        ]).toArray(),
        ticket.collection("booking").aggregate([
          {
            $match: {
              email: email,
              isPaid: false,
            },
          },
          {
            $group: {
              _id: null,
              pendingPay: {
                $sum: {
                  $multiply: ["$price", "$quantity"],
                },
              },
            },
          },
        ]).toArray(),
        ticket.collection("booking").aggregate([
          {
            $match: {
              email: email,
              isPaid: true,
            },
          },
          {
            $group: {
              _id: null,
              totalSeats: {
                $sum: '$quantity'
              },
            },
          },
        ]).toArray(),
      ])

      res.send({
        totalBookings,
        pendingReview,
        approvedPaid,
        rejectedCount,
        totalSpent:totalSpent[0]?.totalSpent,
        pendingPay:pendingPay[0]?.pendingPay,
        totalSeats: totalSeats[0].totalSeats,
      });
    });

    app.get("/api/trx/:email", verifyToken, async (req, res) => {
      const msg = await ticket
        .collection("booking")
        .find({
          email: req.params.email,
          isPaid: true,
        })
        .toArray();
      res.send(msg);
    });

    app.patch("/api/reqbookings/:id", verifyToken, async (req, res) => {
      console.log(req.body);

      const msg = await ticket.collection("booking").updateOne(
        { _id: new ObjectId(req.body._id) },
        {
          $set: {
            status: req.body.status,
          },
        },
      );
      console.log(msg);
      res.send(msg);
    });

    app.get("/api/bookings/vendor/:email", verifyToken, async (req, res) => {
      const data = await ticket
        .collection("booking")
        .find({
          vendorEmail: req.params.email,
        })
        .toArray();
      console.log(data);
      res.send(data);
    });

    // PATCH /api/admin/getuser
    app.patch("/api/admin/getuser", verifyToken, async (req, res) => {
      try {
        const { email, name, img } = req.body;

        const result = await authAccount
          .collection("user")
          .updateOne(
            { email: email },
            { $set: { name, img, updatedAt: new Date().toISOString() } },
          );
        console.log(email);
        if (!result) return res.status(404).json({ message: "User not found" });
        res.status(200).json(result);
      } catch (error) {
        console.error("Update user error:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // post new tickets
    app.post("/api/ticket", verifyToken, async (req, res) => {
      const msg = await ticket.collection("tickets").insertOne(req.body);
      res.send(msg?.acknowledged);
      console.log(msg);
    });

    // PATCH /api/ticket  →  Update a ticket
    app.patch("/api/ticket", verifyToken, async (req, res) => {
      const updatedData = req.body;
      const result = await ticket
        .collection("tickets")
        .updateOne({ _id: new ObjectId(req.body.id) }, { $set: updatedData });
      res.send({
        ...result,
        success: result.modifiedCount === 1,
      });
    });

    // DELETE /api/ticket/:id  →  Delete a ticket
    app.delete("/api/ticket/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await ticket
        .collection("tickets")
        .deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // patch admin reject or approve
    app.patch("/api/admin/tickets", verifyToken, async (req, res) => {
      const status = req.body.verificationStatus;
      const id = req.body.id;
      console.log(req.body);
      const msg = await ticket
        .collection("tickets")
        .updateOne(
          { _id: new ObjectId(id) },
          { $set: { verificationStatus: status } },
        );
      console.log(msg);
      res.send(msg);
    });

    app.get("/api/allticket/latest", async (req, res) => {
      const latestApproved = await ticket
        .collection("tickets")
        .find({ verificationStatus: "approved" })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();

      res.send(latestApproved);
    });

    // patch user role by Admin
    app.patch("/api/admin/users", verifyToken, async (req, res) => {
      const id = req.body?.id;
      const role = req.body?.role;
      const isFraud = req.body?.isFraud;
      const email = req.body?.email;
      console.log(req.body);

      if (isFraud) {
        // Updated this action step to find and modify directly on authAccount collection
        const makeUserAction = await authAccount
          .collection("user")
          .updateOne({ _id: new ObjectId(id) }, { $set: { isBlock: true } });

        const user = await authAccount.collection("user").findOne({
          _id: new ObjectId(id),
        });

        if (user?.email) {
          await ticket.collection("tickets").deleteMany({
            vendorEmail: user.email,
          });
        }

        const makeUserAction2 = await authAccount
          .collection("user")
          .updateOne({ email: email }, { $set: { isFraud: true } });
        res.send(makeUserAction);
      } else if (role) {
        const makeUserAction = await authAccount
          .collection("user")
          .updateOne({ _id: new ObjectId(id) }, { $set: { role: role } });

        const makeUserAction2 = await authAccount
          .collection("user")
          .updateOne({ email: email }, { $set: { role: role } });
        console.log(makeUserAction2, id, role, email);
        res.send(makeUserAction);
      }
    });
  } catch (err) {
    console.error("Initialization error:", err);
  }
}
run();

app.get("/", (req, res) => {
  res.send([{ msg: "your api is working" }]);
});

app.listen(9000, () => {
  console.log(`Server successfully running on port 5000`);
});

module.exports = app;
