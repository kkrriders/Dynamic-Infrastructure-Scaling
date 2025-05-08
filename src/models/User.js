const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true
  },
  expires: {
    type: Date,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v);
      },
      message: props => `${props.value} is not a valid email address!`
    }
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  refreshTokens: [refreshTokenSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  const user = this;
  if (!user.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Add refresh token method
userSchema.methods.addRefreshToken = function(token, expiresIn) {
  // Clean up expired tokens first
  this.refreshTokens = this.refreshTokens.filter(t => t.expires > new Date());
  
  // Calculate expiry date
  const expiryDate = new Date();
  const days = parseInt(expiresIn, 10) || 30;
  expiryDate.setDate(expiryDate.getDate() + days);
  
  // Add new token
  this.refreshTokens.push({
    token,
    expires: expiryDate
  });
  
  // Limit the number of active refresh tokens per user (optional)
  const MAX_TOKENS = 5;
  if (this.refreshTokens.length > MAX_TOKENS) {
    // Sort by creation date (oldest first) and remove excess
    this.refreshTokens.sort((a, b) => a.createdAt - b.createdAt);
    this.refreshTokens = this.refreshTokens.slice(-MAX_TOKENS);
  }
  
  return token;
};

// Find and validate refresh token
userSchema.methods.findRefreshToken = function(token) {
  const tokenDoc = this.refreshTokens.find(t => t.token === token);
  
  if (!tokenDoc) {
    return null;
  }
  
  // Check if token is expired
  if (tokenDoc.expires < new Date()) {
    // Remove expired token
    this.refreshTokens = this.refreshTokens.filter(t => t.token !== token);
    return null;
  }
  
  return tokenDoc;
};

// Remove refresh token
userSchema.methods.removeRefreshToken = function(token) {
  const initialCount = this.refreshTokens.length;
  this.refreshTokens = this.refreshTokens.filter(t => t.token !== token);
  
  return initialCount !== this.refreshTokens.length;
};

// Add index for faster queries
userSchema.index({ email: 1 });

// Create User model
const User = mongoose.model('User', userSchema);

module.exports = User; 