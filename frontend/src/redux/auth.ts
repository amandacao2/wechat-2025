import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// 扩展AuthState接口：新增email（邮箱）、avatar（头像URL）、isLogin（登录状态标识）
interface AuthState {
  token: string;
  user_id: number;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  isLogin: boolean;
}

// 初始状态：默认空值，isLogin初始为false
const initialState: AuthState = {
  token: "",
  user_id: -1,
  name: "",
  email: "",
  phone: "",
  avatar: "",
  isLogin: false,
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    /**
     * 登录/注册成功：统一设置用户信息（含localStorage持久化）
     * @param action 携带token、name、email、avatar的部分数据
     */
    setAuthInfo: (state, action: PayloadAction<Partial<AuthState>>) => {
      state.token = action.payload.token || "";
      state.user_id = action.payload.user_id || -1;
      state.name = action.payload.name || "";
      state.email = action.payload.email || "";
      state.phone = action.payload.phone || "";
      state.avatar = action.payload.avatar || "";
      state.isLogin = !!action.payload.token; // token存在即视为已登录

      // 持久化到localStorage，防止页面刷新丢失
      if (action.payload.token) {
        localStorage.setItem("authInfo", JSON.stringify(action.payload));
      }
    },

    /**
     * 更新用户信息（如编辑邮箱、上传头像后同步状态）
     * @param action 待更新的部分信息（email/avatar）
     */
    updateAuthInfo: (state, action: PayloadAction<Partial<AuthState>>) => {
      state.name = action.payload.name || state.name;
      state.email = action.payload.email || state.email; // 未传则保留原值
      state.phone = action.payload.phone || state.phone; // 未传则保留原值
      state.avatar = action.payload.avatar || state.avatar;

      // 同步更新localStorage
      const localAuth = JSON.parse(localStorage.getItem("authInfo") || "{}");
      localStorage.setItem(
        "authInfo",
        JSON.stringify({ ...localAuth, ...action.payload })
      );
    },

    /**
     * 登出：清空所有状态并删除localStorage
     */
    resetAuth: (state) => {
      state.token = "";
      state.user_id = -1;
      state.name = "";
      state.email = "";
      state.phone = "";
      state.avatar = "";
      state.isLogin = false;
      localStorage.removeItem("authInfo");
    },
  },
});

// 导出动作（供组件调用）
export const { setAuthInfo, updateAuthInfo, resetAuth } = authSlice.actions;
// 导出reducer（供store注册）
export default authSlice.reducer;