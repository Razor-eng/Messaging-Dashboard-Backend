const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

// Add timestamp field for easier client-side handling
messageSchema.set("toJSON", {
  virtuals: true,
  transform: (doc, ret) => {
    ret.timestamp = ret.createdAt
    return ret
  },
})

const Message = mongoose.model("Message", messageSchema)

module.exports = { Message }

