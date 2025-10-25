const jwt = require('jsonwebtoken');

const generateToken = (userId) => {
  return jwt.sign(
    { userId }, 
    process.env.JWT_SECRET || 'ips_fulano_secret_key_2024',
    { expiresIn: '30d' }
  );
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET || 'ips_fulano_secret_key_2024');
};

module.exports = { generateToken, verifyToken };