import { useState } from "react";
import { useRouter } from "next/router";
import { useDispatch } from "react-redux";
import { setAuthInfo } from "../redux/auth";
import {
  BACKEND_URL,
  FAILURE_PREFIX,
  REGISTER_SUCCESS,
  REGISTER_FAILED,
} from "../constants/string";

// 修复：用 interface 替代 type 定义表单类型（符合 @typescript-eslint/consistent-type-definitions 规则）
interface FormData {
  userName: string;
  password: string;
  email: string;
  confirmPassword: string;
}

const RegisterScreen = () => {
  // 表单状态：使用修复后的 interface 定义类型
  const [formData, setFormData] = useState<FormData>({
    userName: "",
    password: "",
    email: "",
    confirmPassword: "",
  });
  // 错误提示状态（保留原有逻辑）
  const [errorMsg, setErrorMsg] = useState("");
  // Next路由实例（保留原有跳转逻辑）
  const router = useRouter();
  // Redux调度器（保留原有状态更新逻辑）
  const dispatch = useDispatch();

  /**
   * 输入框变化处理：同步更新表单状态（保留原有逻辑）
   * @param e 输入框事件对象
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setErrorMsg(""); // 输入时清空错误提示
  };

  /**
   * 注册逻辑：前端校验 → 调用后端接口 → 处理结果（保留原有逻辑，适配BACKEND_URL）
   */
  const register = async () => {
    // 1. 前端表单校验（保留原有规则）
    if (!formData.userName || !formData.password || !formData.email) {
      setErrorMsg("请填写完整的用户名、邮箱和密码");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setErrorMsg("两次输入的密码不一致，请重新确认");
      return;
    }

    try {
      // 2. 调用后端注册接口（适配前端仓库文档约定的 /api/user/register/ 端点）
      const response = await fetch(`${BACKEND_URL}/api/user/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.userName, // 适配后端仓库 User 模型的 username 字段（小写）
          password: formData.password,
          email: formData.email,
          first_name: "",  // 后端接口可选字段
          last_name: "",   // 后端接口可选字段
        }),
      });

      // 3. 解析接口返回结果（保留原有处理逻辑）
      const res = await response.json();

      // 4. 处理成功/失败逻辑（保留原有Redux状态更新）
      if (Number(res.code) === 0) {
        dispatch(
          setAuthInfo({
            token: res.token,
            name: formData.userName,
            email: formData.email,
          })
        );
        alert(REGISTER_SUCCESS);
        router.push("/");
      } else {
        setErrorMsg(res.info || REGISTER_FAILED);
      }
    } catch (err) {
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
        用户注册
      </h2>

      {/* 错误提示区域（保留原有样式） */}
      {errorMsg && (
        <p style={{ color: "#ff4444", textAlign: "center", margin: "0 0 15px 0" }}>
          {errorMsg}
        </p>
      )}

      {/* 注册表单（保留原有结构和样式） */}
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
          type="email"
          name="email"
          placeholder="请输入邮箱"
          value={formData.email}
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
        <input
          type="password"
          name="confirmPassword"
          placeholder="请确认密码"
          value={formData.confirmPassword}
          onChange={handleInputChange}
          style={{
            padding: "10px 12px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            fontSize: "14px",
          }}
        />

        {/* 注册按钮（保留原有禁用逻辑和样式） */}
        <button
          onClick={register}
          disabled={!formData.userName || !formData.password || !formData.email || !formData.confirmPassword}
          style={{
            padding: "12px",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "16px",
            opacity: !formData.userName || !formData.password || !formData.email || !formData.confirmPassword ? 0.6 : 1,
          }}
        >
          注册
        </button>

        {/* 跳转登录页链接（保留原有逻辑） */}
        <p style={{ textAlign: "center", marginTop: "10px", marginBottom: "0" }}>
          已有账号？{" "}
          <span
            onClick={() => router.push("/login")}
            style={{ color: "#2196F3", cursor: "pointer", textDecoration: "underline" }}
          >
            去登录
          </span>
        </p>
      </div>
    </div>
  );
};

export default RegisterScreen;