import express from "express";
import cors from "cors";
import mongoose from "mongoose";

const app = express();
app.use(cors());
app.use(express.json());

/* ── MongoDB Connection ───────────────────────────── */
mongoose.connect("mongodb://127.0.0.1:27017/freelanceDB")
  .then(() => console.log("MongoDB Connected 🚀"))
  .catch(err => console.error(err));

/* ── Schema ───────────────────────────────────────── */
const workSubmissionSchema = new mongoose.Schema({
  jobId: { type: Number, required: true, unique: true },
  freelancer: { type: String, required: true },
  cidHash: { type: String, required: true }, // The bytes32 hash stored on-chain
  originalCid: { type: String, required: true }, // The original IPFS CID
  workDescription: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['submitted', 'confirmed', 'cancelled'], default: 'submitted' }
}, { timestamps: true });

const WorkSubmission = mongoose.model("WorkSubmission", workSubmissionSchema);

/* ── Routes ───────────────────────────────────────── */

/**
 * Store work submission with CID
 */
app.post("/store-work-submission", async (req, res) => {
  try {
    const { jobId, freelancer, cidHash, originalCid, workDescription } = req.body;

    console.log("📝 Received submission:", { jobId, freelancer, cidHashLen: cidHash?.length, cidHash, originalCid });

    if (!jobId || !freelancer || !cidHash || !originalCid || !workDescription) {
      return res.status(400).json({
        error: "Missing required fields: jobId, freelancer, cidHash, originalCid, workDescription"
      });
    }

    // Check if work submission already exists for this job
    const existing = await WorkSubmission.findOne({ jobId });
    if (existing) {
      return res.status(409).json({ error: "Work already submitted for this job" });
    }

    const workSubmission = await WorkSubmission.create({
      jobId,
      freelancer,
      cidHash,
      originalCid,
      workDescription
    });

    console.log("✅ Stored submission:", { jobId, cidHash });

    res.status(201).json({
      message: "Work submission stored successfully",
      data: workSubmission
    });

  } catch (err) {
    console.error("Error storing work submission:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Get work submission by job ID
 */
app.get("/get-work-submission/:jobId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const workSubmission = await WorkSubmission.findOne({ jobId });

    if (!workSubmission) {
      return res.status(404).json({ error: "Work submission not found" });
    }

    res.json(workSubmission);

  } catch (err) {
    console.error("Error fetching work submission:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Get original CID by stored CID hash
 */
app.get("/get-cid/:cidHash", async (req, res) => {
  try {
    const cidHash = req.params.cidHash;
    console.log("🔍 Searching for cidHash:", cidHash);

    const workSubmission = await WorkSubmission.findOne({ cidHash });

    console.log("🔎 Query result:", workSubmission ? "Found ✅" : "Not found ❌");

    if (!workSubmission) {
      // Debug: Check all cidHashes in database
      const allSubmissions = await WorkSubmission.find({});
      console.log("📊 All stored cidHashes in DB:", allSubmissions.map(s => s.cidHash));
      return res.status(404).json({ error: "CID not found" });
    }

    res.json({ cid: workSubmission.originalCid, jobId: workSubmission.jobId, freelancer: workSubmission.freelancer });

  } catch (err) {
    console.error("Error fetching CID mapping:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Update work submission status
 */
app.patch("/update-work-status/:jobId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);
    const { status } = req.body;

    if (!['submitted', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: "Invalid status. Must be: submitted, confirmed, or cancelled" });
    }

    const workSubmission = await WorkSubmission.findOneAndUpdate(
      { jobId },
      { status },
      { new: true }
    );

    if (!workSubmission) {
      return res.status(404).json({ error: "Work submission not found" });
    }

    res.json({
      message: "Work status updated successfully",
      data: workSubmission
    });

  } catch (err) {
    console.error("Error updating work status:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Delete work submission by jobId
 */
app.delete("/delete-work-submission/:jobId", async (req, res) => {
  try {
    const jobId = parseInt(req.params.jobId);

    const result = await WorkSubmission.findOneAndDelete({ jobId });

    if (!result) {
      return res.status(404).json({ error: "Work submission not found" });
    }

    res.json({
      message: "Work submission deleted successfully",
      data: result
    });

  } catch (err) {
    console.error("Error deleting work submission:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * Get all work submissions for a freelancer
 */
app.get("/freelancer-work/:freelancer", async (req, res) => {
  try {
    const workSubmissions = await WorkSubmission.find({ freelancer: req.params.freelancer })
      .sort({ submittedAt: -1 });

    res.json(workSubmissions);

  } catch (err) {
    console.error("Error fetching freelancer work:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "backend-v1" });
});

/* ── Start server ─────────────────────────────────── */
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});