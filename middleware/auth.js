
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/auth/login');
}
  
  
function isNotAuthenticated(req, res, next) {
  if (!req.session || !req.session.userId) {
    return next();
  }
  res.redirect('/');
}
  
module.exports = {
  isAuthenticated,
  isNotAuthenticated
};