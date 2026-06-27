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

// Middleware to verify JWT token authenticity
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
    const authAccount = await client.db("TL_AUTH");

    // ==========================================
    // GET METHODS
    // ==========================================

    // GET: Health check endpoint to verify API functionality
    app.get("/", (req, res) => {
      res.send([{ msg: "your api is working" }]);
    });

    // GET: Retrieve all registered users for admin management
    app.get("/api/admin/user", verifyToken, async (req, res) => {
      const data = await authAccount.collection("user").find().toArray();
      res.send(data);
    });

    // GET: Fetch approved tickets with pagination, sorting, and dynamic regex filtering (to, from, type)
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
          to: { $regex: req.query.to, $options: "i" },
          from: { $regex: req.query.from, $options: "i" },
          transportType: { $regex: req.query.type, $options: "i" },
        })
        .sort(sortMap[req.query.sort])
        .skip(skip)
        .limit(6)
        .toArray();
        
      const totalTicket = await ticket.collection("tickets").countDocuments({
        verificationStatus: "approved",
        to: { $regex: req.query.to, $options: "i" },
        from: { $regex: req.query.from, $options: "i" },
        transportType: { $regex: req.query.type, $options: "i" },
      });

      res.send({
        tickets: data,
        totalTicket,
        currentPage: page,
        totalPage: Math.ceil(totalTicket / 6),
      });
    });

    // GET: Fetch all approved tickets globally without pagination
    app.get("/api/allticket/ad", async (req, res) => {
      const data = await ticket
        .collection("tickets")
        .find({ verificationStatus: "approved" })
        .toArray();
      res.send(data);
    });

    // GET: Aggregate statistical metrics across tickets and accounts for the admin dashboard dashboard overview
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
          ticket.collection("tickets").countDocuments({ verificationStatus: "pending" }),
          ticket.collection("tickets").countDocuments({ verificationStatus: "approved" }),
          ticket.collection("tickets").countDocuments({ verificationStatus: "rejected" }),
          authAccount.collection("user").countDocuments({ role: { $ne: "admin" } }),
          authAccount.collection("user").countDocuments({ role: "user", isBlock: false }),
          authAccount.collection("user").countDocuments({ role: "vendor", isBlock: false }),
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

    // GET: Fetch detailed info for a single approved ticket using its hex ID string
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

    // GET: Retrieve all tickets highlighted as advertisements
    app.get("/api/adticket", async (req, res) => {
      const data = await ticket
        .collection("tickets")
        .find({ isAd: true })
        .toArray();
      res.send(data);
    });

    // GET: Fetch all tickets owned and managed by a specific vendor email address
    app.get("/api/myticket/:email", async (req, res) => {
      const email = req.params.email;
      const filter = { vendorEmail: email };
      const data = await ticket.collection("tickets").find(filter).toArray();
      res.send(data);
    });

    // GET: Retrieve absolutely all documents residing in the tickets collection
    app.get("/api/allticket", async (req, res) => {
      const data = await ticket.collection("tickets").find().toArray();
      console.log(data);
      res.send(data);
    });

    // GET: Search and return user metadata matching a specific profile email address
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

    // GET: Fetch all bookings reserved under a particular consumer's email address
    app.get("/api/bookings/:email", verifyToken, async (req, res) => {
      const result = await ticket
        .collection("booking")
        .find({ email: req.params.email })
        .toArray();
      res.send(result);
    });

    // GET: Retrieve successful paid bookings for tracking vendor revenue records
    app.get('/api/vendor/rev/:email', verifyToken, async (req, res) => {
       const data = await ticket.collection('booking').find({
         vendorEmail: req.params.email,
         isPaid: true,
       }).toArray();
       res.send(data);
    });

    // GET: Aggregate personal booking telemetry (spending, quantities, statuses) for a user profile
    app.get("/api/user/stats/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const [
        totalBookings,
        pendingReview,
        approvedPaid,
        rejectedCount,
        totalSpent,
        pendingPay,
        totalSeats,
      ] = await Promise.all([
        ticket.collection("booking").countDocuments({ email: email }),
        ticket.collection("booking").countDocuments({ email: email, status: "pending" }),
        ticket.collection("booking").countDocuments({ email: email, status: "accepted" }),
        ticket.collection("booking").countDocuments({ email: email, status: "rejected" }),
        ticket.collection("booking").aggregate([
          { $match: { email: email, isPaid: true } },
          { $group: { _id: null, totalSpent: { $sum: { $multiply: ["$price", "$quantity"] } } } },
        ]).toArray(),
        ticket.collection("booking").aggregate([
          { $match: { email: email, isPaid: false } },
          { $group: { _id: null, pendingPay: { $sum: { $multiply: ["$price", "$quantity"] } } } },
        ]).toArray(),
        ticket.collection("booking").aggregate([
          { $match: { email: email, isPaid: true } },
          { $group: { _id: null, totalSeats: { $sum: '$quantity' } } },
        ]).toArray(),
      ]);

      res.send({
        totalBookings,
        pendingReview,
        approvedPaid,
        rejectedCount,
        totalSpent: totalSpent[0]?.totalSpent,
        pendingPay: pendingPay[0]?.pendingPay,
        totalSeats: totalSeats[0]?.totalSeats,
      });
    });

    // GET: Fetch payment ledger transactions for an authenticated consumer's account profile
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

    // GET: Retrieve all bookings made against services belonging to a certain vendor account
    app.get("/api/bookings/vendor/:email", verifyToken, async (req, res) => {
      const data = await ticket
        .collection("booking")
        .find({ vendorEmail: req.params.email })
        .toArray();
      console.log(data);
      res.send(data);
    });

    // GET: Fetch the 6 most recently listed items flagged with approved verification status
    app.get("/api/allticket/latest", async (req, res) => {
      const latestApproved = await ticket
        .collection("tickets")
        .find({ verificationStatus: "approved" })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();

      res.send(latestApproved);
    });

    // ==========================================
    // POST METHODS
    // ==========================================

    // POST: Submit a new booking order, atomically adjusting inventories/sales counters on the source ticket
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

    // POST: Add a fresh ticket listing into the primary distribution engine catalog
    app.post("/api/ticket", verifyToken, async (req, res) => {
      const msg = await ticket.collection("tickets").insertOne(req.body);
      res.send(msg?.acknowledged);
      console.log(msg);
    });

    // ==========================================
    // PATCH METHODS
    // ==========================================

    // PATCH: Toggle an individual ticket document's generic advertising feature visibility status
    app.patch("/api/ticket/ad", async (req, res) => {
      const msg = await ticket.collection("tickets").updateOne(
        { _id: new ObjectId(req.body.id) },
        { $set: { isAd: req.body.isAd } },
      );
      if (msg.modifiedCount === 1) {
        res.send({ success: true });
      }
    });

    // PATCH: Complete settlement payments for a booking reservation, stamping timestamps and unique reference IDs
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
        res.send({ msg: "already paid" });
      }
    });

    // PATCH: Update administrative disposition status configurations for client booking records
    app.patch("/api/reqbookings/:id", verifyToken, async (req, res) => {
      console.log(req.body);

      const msg = await ticket.collection("booking").updateOne(
        { _id: new ObjectId(req.body._id) },
        { $set: { status: req.body.status } },
      );
      console.log(msg);
      res.send(msg);
    });

    // PATCH: Update basic account identification metrics (names, images, revision timestamps) for users
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

    // PATCH: Modify global parameters for a pre-existing ticket record by targeting its Object ID
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

    // PATCH: Update a listing's status to approved or rejected for publication review controls
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

    // PATCH: Administrative tool handling structural adjustments, blocking fraudulent vendors, and altering user authorizations
    app.patch("/api/admin/users", verifyToken, async (req, res) => {
      const id = req.body?.id;
      const role = req.body?.role;
      const isFraud = req.body?.isFraud;
      const email = req.body?.email;
      console.log(req.body);

      if (isFraud) {
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

    // ==========================================
    // DELETE METHODS
    // ==========================================

    // DELETE: Permanently purge an individual ticket listing completely out of the database catalog mapping
    app.delete("/api/ticket/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const result = await ticket
        .collection("tickets")
        .deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

  } catch (err) {
    console.error("Initialization error:", err);
  }
}
run();

// App port configurations (Log indicates 5000, but binds to 9000)
app.listen(9000, () => {
  console.log(`Server successfully running on port 9000
    `);
});

module.exports = app;