'use strict';
/**
 * รวม RESTful API Routes ทั้งหมดภายใต้ /api
 */
const express = require('express');
const { asyncHandler: h } = require('../utils/httpError');
const { authenticate, optionalAuth, requireUser, requireAdmin } = require('../middleware/auth');
const L = require('../middleware/rateLimiters');
const { uploadImage } = require('../middleware/upload');

const auth = require('../controllers/authController');
const found = require('../controllers/foundController');
const lost = require('../controllers/lostController');
const claims = require('../controllers/claimController');
const messages = require('../controllers/messageController');
const admin = require('../controllers/adminController');
const meta = require('../controllers/metaController');
const notifications = require('../controllers/notificationController');

const router = express.Router();

// ---------- Meta (สาธารณะ) ----------
router.get('/meta', h(meta.meta));
router.get('/meta/stats', h(meta.publicStats));

// ---------- Auth ----------
router.post('/auth/register', L.registerLimiter, h(auth.register));
router.post('/auth/login', L.loginLimiter, h(auth.login));
router.post('/auth/logout', optionalAuth, h(auth.logout));
router.get('/auth/me', authenticate, h(auth.me));

// ---------- Found items ----------
router.get('/found', h(found.listPublic));
router.get('/found/mine', authenticate, requireUser, h(found.mine));
router.get('/found/:id', authenticate, requireUser, h(found.getDetail));
router.get('/found/:id/image', authenticate, requireUser, h(found.getImage));
router.post('/found', authenticate, requireUser, L.createLimiter, uploadImage, h(found.create));
router.delete('/found/:id', authenticate, requireUser, h(found.remove));

// ---------- Lost items ----------
router.get('/lost/mine', authenticate, requireUser, h(lost.mine));
router.post('/lost', authenticate, requireUser, L.createLimiter, h(lost.create));
router.get('/lost/:id', authenticate, requireUser, h(lost.getOne));
router.get('/lost/:id/matches', authenticate, requireUser, h(lost.getMatches));
router.post('/lost/:id/rematch', authenticate, requireUser, h(lost.rematch));
router.patch('/lost/:id/cancel', authenticate, requireUser, h(lost.cancel));

// ---------- Verification claims ----------
router.post('/claims/found/:id/answers', authenticate, requireUser, L.verifyLimiter, h(claims.submitAnswers));
router.get('/claims/mine', authenticate, requireUser, h(claims.mine));
router.get('/claims/review', authenticate, requireUser, h(claims.reviewList));
router.post('/claims/:id/decision', authenticate, requireUser, h(claims.decide));
router.post('/claims/:id/complete', authenticate, requireUser, h(claims.complete));
router.get('/claims/:id/messages', authenticate, requireUser, h(messages.list));
router.post('/claims/:id/messages', authenticate, requireUser, L.messageLimiter, h(messages.send));

// ---------- Notifications ----------
router.get('/notifications', authenticate, h(notifications.list));
router.post('/notifications/read', authenticate, h(notifications.markRead));

// ---------- Admin (RBAC: admin เท่านั้น) ----------
const adminRouter = express.Router();
adminRouter.use(authenticate, requireAdmin);
adminRouter.get('/stats', h(admin.stats));
adminRouter.get('/users', h(admin.listUsers));
adminRouter.patch('/users/:id', h(admin.updateUser));
adminRouter.get('/items', h(admin.listItems));
adminRouter.delete('/items/:type/:id', h(admin.deleteItem));
adminRouter.get('/claims', h(admin.listClaims));
adminRouter.post('/claims/:id/unlock', h(admin.unlockClaim));
adminRouter.get('/audit-logs', h(admin.auditLogs));
router.use('/admin', adminRouter);

module.exports = router;
