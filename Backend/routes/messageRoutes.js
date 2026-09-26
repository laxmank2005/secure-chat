import express from "express";
import { sendMessage, getMessage, markAsRead, editMessage, deleteMessage, reactMessage, createGroup, updateGroup, addGroupMember, removeGroupMember, getGroupInfo, updateGroupAdmin } from "../controllers/messageController.js";
import isauthenticated from "../middleware/isAuthenticated.js";

const router = express.Router();

router.route("/send/:id").post(isauthenticated, sendMessage);
// IMPORTANT: /read/:senderId must be declared BEFORE /:id to avoid route conflict
router.route("/group/create").post(isauthenticated, createGroup);
router.route("/group/update/:groupId").put(isauthenticated, updateGroup);
router.route("/group/add/:groupId").post(isauthenticated, addGroupMember);
router.route("/group/remove/:groupId").post(isauthenticated, removeGroupMember);
router.route("/group/admin/:groupId").put(isauthenticated, updateGroupAdmin);
router.route("/group/:groupId").get(isauthenticated, getGroupInfo);
router.route("/read/:senderId").put(isauthenticated, markAsRead);
router.route("/edit/:msgId").put(isauthenticated, editMessage);
router.route("/delete/:msgId").delete(isauthenticated, deleteMessage);
router.route("/react/:msgId").post(isauthenticated, reactMessage);
router.route("/:id").get(isauthenticated, getMessage);

export default router;