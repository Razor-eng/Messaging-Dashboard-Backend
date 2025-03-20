const express = require("express")
const { User } = require("../models/User")
const auth = require("../middleware/auth")

const router = express.Router()

// Get all users (except current user)
router.get("/", auth, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } }).select("-password")

    res.json(users)
  } catch (error) {
    console.error("Get users error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get user by ID
router.get("/:id", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password")

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    res.json(user)
  } catch (error) {
    console.error("Get user error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Update user profile
router.put("/profile", auth, async (req, res) => {
  try {
    const { name, avatar } = req.body

    const updateData = {}
    if (name) updateData.name = name
    if (avatar) updateData.avatar = avatar

    const user = await User.findByIdAndUpdate(req.userId, { $set: updateData }, { new: true }).select("-password")

    res.json(user)
  } catch (error) {
    console.error("Update profile error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router

