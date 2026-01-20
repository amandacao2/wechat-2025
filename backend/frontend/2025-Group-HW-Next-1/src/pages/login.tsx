import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { setAuthInfo } from "../redux/auth";
import { RootState } from "../redux/store";
import {
  BACKEND_URL,
  FAILURE_PREFIX,
  LOGIN_FAILED,
  LOGIN_SUCCESS_PREFIX,
} from "../constants/string";

// 表单状态：用户名、密码（保留前端仓库文档中原有的表单逻辑）
const LoginScreen = () => {
  const [formData, setFormData] = useState({
    userName: "",
    password: "",
  });
  // 错误提示状态（保留原有错误处理逻辑）
  const [errorMsg, setErrorMsg] = useState("");
  // Redux状态：获取当前登录状态（保留原有Redux关联）
  const { isLogin } = useSelector((state: RootState) => state.auth);
  // Next路由实例（保留原有路由跳转逻辑）
  const router = useRouter();
  // Redux调度器（保留原有状态更新逻辑）
  const dispatch = useDispatch();

  /**
   * 已登录判断：若已登录，自动跳转首页（避免重复登录）（保留原有校验逻辑）
   */
  useEffect(() => {
    if (isLogin) {
      router.push("/");
    }
  }, [isLogin, router]);

  /**
   * 输入框变化处理：同步更新表单状态（保留原有输入处理）
   * @param e 输入框事件对象
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setErrorMsg(""); // 输入时清空错误提示
  };

  /**
   * 登录逻辑：前端校验 → 调用后端接口 → 处理结果（保留原有接口调用逻辑，适配BACKEND_URL环境变量）
   */
  const login = async () => {
    // 1. 前端表单校验（保留原有校验规则）
    if (!formData.userName || !formData.password) {
      setErrorMsg("请填写用户名和密码");
      return;
    }

    try {
      // 2. 调用后端登录接口（使用前端仓库文档中约定的/api/user/login/端点，适配BACKEND_URL）
      const response = await fetch(`${BACKEND_URL}/api/user/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.userName, // 适配后端仓库文档中User模型的username字段（小写）
          password: formData.password,
        }),
      });

      // 3. 解析接口返回结果（保留原有结果处理逻辑）
      const res = await response.json();

      // 4. 处理成功/失败逻辑（保留原有Redux状态更新）
      if (Number(res.code) === 0) {
        // 登录成功：从后端返回的user对象中获取信息（适配后端仓库user/views.py返回的user_data结构）
        dispatch(
          setAuthInfo({
            token: res.token,
            user_id: res.user.id,
            name: res.user.username,
            email: res.user.email || "",
            phone: res.user.phone || "",
            avatar: res.user.avatar !== null ? `${BACKEND_URL}${res.user.avatar}` || "" : "",
          })
        );
        alert(LOGIN_SUCCESS_PREFIX + res.user.username);
        router.back(); // 若无历史记录，跳转到首页
      } else {
        // 登录失败：显示后端返回的错误信息
        setErrorMsg(res.info || LOGIN_FAILED);
      }
    } catch (err) {
      // 网络异常：显示通用错误提示
      setErrorMsg(FAILURE_PREFIX + String(err));
    }
  };

  return (
    <div
      style={{
        maxWidth: "400px",
        margin: "50px auto",
        padding: "20px",
        border: "1px solid #eee",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <h2 style={{ textAlign: "center", marginBottom: "30px", color: "#333" }}>
        用户登录
      </h2>

      {/* 错误提示区域（保留原有样式） */}
      {errorMsg && (
        <p style={{ color: "#ff4444", textAlign: "center", margin: "0 0 15px 0" }}>
          {errorMsg}
        </p>
      )}

      {/* 登录表单（保留原有表单结构和样式） */}
      <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        <input
          type="text"
          name="userName"
          placeholder="请输入用户名"
          value={formData.userName}
          onChange={handleInputChange}
          style={{
            padding: "10px 12px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            fontSize: "14px",
          }}
        />
        <input
          type="password"
          name="password"
          placeholder="请输入密码"
          value={formData.password}
          onChange={handleInputChange}
          style={{
            padding: "10px 12px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            fontSize: "14px",
          }}
        />

        {/* 登录按钮（保留原有禁用逻辑和样式） */}
        <button
          onClick={login}
          disabled={!formData.userName || !formData.password}
          style={{
            padding: "12px",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "16px",
            opacity: !formData.userName || !formData.password ? 0.6 : 1,
          }}
        >
          登录
        </button>

        {/* 跳转注册页链接（保留原有跳转逻辑） */}
        <p style={{ textAlign: "center", marginTop: "10px", marginBottom: "0" }}>
          没有账号？{" "}
          <span
            onClick={() => router.push("/register")}
            style={{ color: "#2196F3", cursor: "pointer", textDecoration: "underline" }}
          >
            去注册
          </span>
        </p>
      </div>
    </div>
  );
};

export default LoginScreen;