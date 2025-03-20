const express = require("express")
const http = require("http")
const mongoose = require("mongoose")
const cors = require("cors")
const dotenv = require("dotenv")
const socketIo = require("socket.io")
const jwt = require("jsonwebtoken")
const authRoutes = require("./routes/auth")
const userRoutes = require("./routes/users")
const chatRoutes = require("./routes/chats")
const { User } = require("./models/User")
const { Chat } = require("./models/Chat")
const { Message } = require("./models/Message")

// Load environment variables
dotenv.config()

// Initialize Express app
const app = express()
const server = http.createServer(app)

// Get environment variables with fallbacks
const PORT = process.env.PORT || 5000
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/messaging-app"
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000"
const JWT_SECRET = process.env.JWT_SECRET || "default_jwt_secret_key_for_development"

// Middleware
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  }),
)
app.use(express.json())

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ message: "Something went wrong on the server" })
})

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/chats", chatRoutes)

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" })
})

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
})

// Socket.io middleware for authentication
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error("Authentication error"))
    }

    const decoded = jwt.verify(token, JWT_SECRET)
    socket.userId = decoded.userId

    // Update user status to online
    await User.findByIdAndUpdate(decoded.userId, { status: "online" })

    next()
  } catch (error) {
    console.error("Socket authentication error:", error)
    next(new Error("Authentication error"))
  }
})

// Connected users map
const connectedUsers = new Map()

// Socket.io connection handler
io.on("connection", async (socket) => {
  console.log(`User connected: ${socket.userId}`)

  // Add user to connected users map
  connectedUsers.set(socket.userId, socket.id)

  // Broadcast user status to all connected clients
  io.emit("user_status", { userId: socket.userId, status: "online" })

  try {
    // Join user to their chat rooms
    const userChats = await Chat.find({
      participants: socket.userId,
    })

    userChats.forEach((chat) => {
      socket.join(chat._id.toString())
    })
  } catch (error) {
    console.error("Error joining chat rooms:", error)
  }

  // Handle send message
  socket.on("send_message", async (data) => {
    try {
      const { content, chatId } = data

      // Create new message
      const newMessage = new Message({
        sender: socket.userId,
        content,
        chatId,
        read: false,
      })

      await newMessage.save()

      // Update chat's last message
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: newMessage._id,
      })

      // Get populated message
      const populatedMessage = await Message.findById(newMessage._id).populate("sender", "name avatar").lean()

      // Emit message to chat room
      io.to(chatId).emit("new_message", populatedMessage)
    } catch (error) {
      console.error("Error sending message:", error)
      socket.emit("error", { message: "Failed to send message" })
    }
  })

  // Handle typing indicator
  socket.on("typing", (data) => {
    const { chatId, isTyping } = data

    // Broadcast typing status to chat room (except sender)
    socket.to(chatId).emit("typing", { chatId, isTyping })
  })

  // Handle read messages
  socket.on("read_message", async (data) => {
    try {
      const { chatId } = data

      // Mark all unread messages as read
      await Message.updateMany({ chatId, receiver: socket.userId, read: false }, { read: true })

      // Notify other users in the chat
      socket.to(chatId).emit("messages_read", { chatId, userId: socket.userId })
    } catch (error) {
      console.error("Error marking messages as read:", error)
      socket.emit("error", { message: "Failed to mark messages as read" })
    }
  })

  // Handle disconnect
  socket.on("disconnect", async () => {
    console.log(`User disconnected: ${socket.userId}`)

    // Remove user from connected users map
    connectedUsers.delete(socket.userId)

    try {
      // Update user status to offline
      await User.findByIdAndUpdate(socket.userId, {
        status: "offline",
        lastSeen: new Date(),
      })

      // Broadcast user status to all connected clients
      io.emit("user_status", { userId: socket.userId, status: "offline" })
    } catch (error) {
      console.error("Error updating user status on disconnect:", error)
    }
  })
})

// Connect to MongoDB
mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB")

    // Start server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err)
    process.exit(1)
  })

// Handle unhandled promise rejections
process.on("unhandledRejection", (error) => {
  console.error("Unhandled Rejection:", error)
})

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error)
  process.exit(1)
})

