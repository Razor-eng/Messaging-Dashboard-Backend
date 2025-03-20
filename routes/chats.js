const express = require("express")
const mongoose = require("mongoose")
const { Chat } = require("../models/Chat")
const { Message } = require("../models/Message")
const { User } = require("../models/User")
const auth = require("../middleware/auth")

const router = express.Router()

// Get all chats for current user
router.get("/", auth, async (req, res) => {
  try {
    // Find all chats where the current user is a participant
    const chats = await Chat.find({ participants: req.userId })
      .populate("participants", "name email avatar status lastSeen")
      .populate("lastMessage")
      .sort({ updatedAt: -1 })

    // Get unread count for each chat
    const chatsWithUnreadCount = await Promise.all(
      chats.map(async (chat) => {
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          sender: { $ne: req.userId },
          read: false,
        })

        const chatObj = chat.toObject()
        chatObj.unreadCount = unreadCount
        return chatObj
      }),
    )

    res.json(chatsWithUnreadCount)
  } catch (error) {
    console.error("Get chats error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Create a new chat
router.post("/", auth, async (req, res) => {
  try {
    const { participantId } = req.body

    // Check if participant exists
    const participant = await User.findById(participantId)
    if (!participant) {
      return res.status(404).json({ message: "User not found" })
    }

    // Check if chat already exists
    const existingChat = await Chat.findOne({
      isGroup: false,
      participants: { $all: [req.userId, participantId], $size: 2 },
    })

    if (existingChat) {
      // Return existing chat
      const populatedChat = await Chat.findById(existingChat._id)
        .populate("participants", "name email avatar status lastSeen")
        .populate("lastMessage")

      const unreadCount = await Message.countDocuments({
        chatId: existingChat._id,
        sender: { $ne: req.userId },
        read: false,
      })

      const chatObj = populatedChat.toObject()
      chatObj.unreadCount = unreadCount

      return res.json(chatObj)
    }

    // Create new chat
    const newChat = new Chat({
      participants: [req.userId, participantId],
      isGroup: false,
    })

    await newChat.save()

    // Return populated chat
    const populatedChat = await Chat.findById(newChat._id).populate("participants", "name email avatar status lastSeen")

    const chatObj = populatedChat.toObject()
    chatObj.unreadCount = 0

    res.status(201).json(chatObj)
  } catch (error) {
    console.error("Create chat error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Create a group chat
router.post("/group", auth, async (req, res) => {
  try {
    const { name, participantIds } = req.body

    if (!name || !participantIds || !Array.isArray(participantIds)) {
      return res.status(400).json({ message: "Invalid request data" })
    }

    // Add current user to participants if not already included
    if (!participantIds.includes(req.userId)) {
      participantIds.push(req.userId)
    }

    // Create new group chat
    const newGroupChat = new Chat({
      participants: participantIds,
      isGroup: true,
      groupName: name,
    })

    await newGroupChat.save()

    // Return populated chat
    const populatedChat = await Chat.findById(newGroupChat._id).populate(
      "participants",
      "name email avatar status lastSeen",
    )

    const chatObj = populatedChat.toObject()
    chatObj.unreadCount = 0

    res.status(201).json(chatObj)
  } catch (error) {
    console.error("Create group chat error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

// Get messages for a chat
router.get("/:chatId/messages", auth, async (req, res) => {
  try {
    const { chatId } = req.params

    // Check if chat exists and user is a participant
    const chat = await Chat.findOne({
      _id: chatId,
      participants: req.userId,
    })

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" })
    }

    // Get messages
    const messages = await Message.find({ chatId }).sort({ createdAt: 1 })

    res.json(messages)
  } catch (error) {
    console.error("Get messages error:", error)
    res.status(500).json({ message: "Server error" })
  }
})

module.exports = router

