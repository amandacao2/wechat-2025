// 保留原环境变量打印和BACKEND_URL定义
console.log("当前 BACKEND_URL 环境变量：", process.env.NEXT_PUBLIC_BACKEND_URL);
// export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://2025-group-hw-django-1-owowowo.app.secoder.net";
export const BACKEND_URL = process.env.NODE_ENV === 'development' ? "http://localhost:8000" : "https://2025-group-hw-django-1-owowowo.app.secoder.net";

// 新增：群聊相关API路径（统一管理，避免硬编码）
export const GROUP_API = {
  LIST: `${BACKEND_URL}/api/groups/`, // 获取用户群列表
  DETAIL: (groupId: number | string) => `${BACKEND_URL}/api/groups/${groupId}/`, // 获取群详情
  MEMBERS: (groupId: number | string) => `${BACKEND_URL}/api/groups/${groupId}/members/`, // 获取群成员
  MUTE: (groupId: number | string) => `${BACKEND_URL}/api/groups/${groupId}/mute/`, // 切换群免打扰
  NOTICE: (groupId: number | string) => `${BACKEND_URL}/api/groups/${groupId}/`, // 更新群公告
  QUIT: (groupId: number | string) => `${BACKEND_URL}/api/groups/${groupId}/quit/`, // 退出群聊
  INVITE: (groupId: number | string) => `${BACKEND_URL}/api/groups/${groupId}/invitations/`, // 发送群邀请
  MEMBER_MANAGE: (groupId: number | string, userId: number | string) => 
    `${BACKEND_URL}/api/groups/${groupId}/members/${userId}/` // 管理群成员（移除/设管理员）
};

// 操作成功提示（保留原有内容）
export const CREATE_SUCCESS = "成功创建一个账户";
export const UPDATE_SUCCESS = "成功更新该账户";
export const DELETE_SUCCESS = "成功注销该账户";
export const DELETE_FAILED = "注销失败";
export const REGISTER_SUCCESS = "注册成功，即将跳转首页！";
export const LOGIN_SUCCESS_PREFIX = "登录成功，欢迎：";
export const PROFILE_UPDATE_SUCCESS = "个人信息更新成功！";
// 新增：群聊相关成功提示
export const GROUP_MUTE_SUCCESS = (isMuted: boolean) => isMuted ? "已开启群免打扰" : "已关闭群免打扰";
export const GROUP_NOTICE_SUCCESS = "群公告更新成功";
export const GROUP_QUIT_SUCCESS = "已退出群聊";
export const GROUP_INVITE_SUCCESS = "群邀请发送成功";
export const GROUP_CREATE_SUCCESS = "群聊成功创建";
export const GROUP_CREATE_FAILED = "群聊成功失败";

// 操作失败提示（保留原有内容）
export const FAILURE_PREFIX = "网络请求失败：";
export const LOGIN_FAILED = "登录失败，用户名或密码错误！";
export const REGISTER_FAILED = "注册失败，请重试！";
export const LOGIN_REQUIRED = "你需要登录才能完成这一操作！";
// 新增：群聊相关失败提示
export const GROUP_FETCH_FAILED = "获取群信息失败";
export const GROUP_MUTE_FAILED = "切换群免打扰失败";
export const GROUP_NOTICE_FAILED = "更新群公告失败";
export const GROUP_QUIT_FAILED = "退出群聊失败";
export const GROUP_INVITE_FAILED = "发送群邀请失败";
export const GROUP_MEMBER_FETCH_FAILED = "获取群成员失败";