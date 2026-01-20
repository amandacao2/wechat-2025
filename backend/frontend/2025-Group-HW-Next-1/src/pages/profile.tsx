import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useDispatch, useSelector } from "react-redux";
import { updateAuthInfo, resetAuth } from "../redux/auth";
import { RootState } from "../redux/store";
import {
  BACKEND_URL,
  FAILURE_PREFIX,
  PROFILE_UPDATE_SUCCESS,
  LOGIN_REQUIRED,
  DELETE_SUCCESS,
  DELETE_FAILED
} from "../constants/string";

const ProfileScreen = () => {
  const router = useRouter();
  const dispatch = useDispatch();
  
  const { user_id } = router.query;

  const { name, email, phone, avatar, isLogin } = useSelector((state: RootState) => state.auth);
  // 修复：初始化 avatar 时处理 null 为 undefined
  const [formData, setFormData] = useState({
    name,
    email: email || "",
    phone: phone || "",
    avatar: !user_id ? avatar || "" : "",
    password: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | undefined>(undefined);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const handleInitial = async () => {
    if (user_id) {
      console.log("query:", user_id)
      const response = await fetch(`${BACKEND_URL}/api/user/profile/${user_id}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("authInfo") 
            ? JSON.parse(localStorage.getItem("authInfo")!).token 
            : ""}`,
        }
      });
    
      const res = await response.json();

      console.log("res:", res)

      if (res.code === 0) {
        setFormData(
          {
            name: res.user.username,
            email: res.user.email,
            phone: res.user.phone,
            avatar: res.user.avatar !== null ? `${BACKEND_URL}${res.user.avatar}` || "" : "",
            password: "",
            newPassword: "",
            confirmPassword: "",
          }
        )
      } else {
        setErrorMsg(res.info || DELETE_FAILED);
      }
    } else {
      setFormData(
        {
          name,
          email,
          phone,
          avatar,
          password: "",
          newPassword: "",
          confirmPassword: "",
        }
      )
    }
  }

  useEffect(() => {
    console.log("Initial....")
    handleInitial();
  }, [router])

  // 未登录拦截
  useEffect(() => {
    if (!isLogin && !user_id) {
      alert(LOGIN_REQUIRED);
      router.push("/login");
    }
  }, [isLogin, router]);

  // 输入框同步
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setSuccessMsg("");
    setErrorMsg("");
  };

  // 头像文件处理
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setFormData({ ...formData, avatar: event.target.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const deleteUser = async () => {
    const response = await fetch(`${BACKEND_URL}/api/user/delete/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authInfo") 
          ? JSON.parse(localStorage.getItem("authInfo")!).token 
          : ""}`,
      },
      body: JSON.stringify({
        password: formData.password || ""
      })
    });
    
    const res = await response.json();

    if (res.code === 0) {
      dispatch(resetAuth());
      alert(DELETE_SUCCESS);
      router.push("/login");
    } else {
      setErrorMsg(res.info || DELETE_FAILED);
    }
  }

  const updateProfile = async () => {
    // 前端邮箱校验
    const emailRegex = /^[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
    if (formData.email && !emailRegex.test(formData.email)) {
      setErrorMsg("请输入有效的邮箱格式");
      return;
    }
    const phoneRegex = /^\+?[\s./0-9]{7,20}$/;
    if (formData.phone && !phoneRegex.test(formData.phone)) {
      setErrorMsg("请输入有效的电话格式");
      return;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      setErrorMsg("两次输入的新密码不同");
      return;
    }

    try {
      const requestFormData = new FormData();
      requestFormData.append("username", formData.name);
      requestFormData.append("email", formData.email);
      requestFormData.append("phone", formData.phone);
      requestFormData.append("password", formData.password);
      if (formData.newPassword) requestFormData.append("newPassword", formData.newPassword);
      if (avatarFile) requestFormData.append("avatar", avatarFile);

      const response = await fetch(`${BACKEND_URL}/api/user/profile/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("authInfo") 
            ? JSON.parse(localStorage.getItem("authInfo")!).token 
            : ""}`,
        },
        body: requestFormData,
      });

      // 处理后端响应
      let res;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        res = await response.json();
      } else {
        throw new Error("后端返回非 JSON 格式（可能路径错误）");
      }

      if (Number(res.code) === 0) {
        dispatch(
          updateAuthInfo({
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            // 修复：处理后端返回的 avatar 为 null 的情况
            avatar: res.user.avatar !== null ? `${BACKEND_URL}${res.user.avatar}` || "" : "",
          })
        );
        setSuccessMsg(PROFILE_UPDATE_SUCCESS);
        setAvatarFile(undefined);
      } else {
        setErrorMsg(res.info || "个人信息更新失败");
      }
    } catch (err) {
      setErrorMsg(FAILURE_PREFIX + String(err));
    }
  };

  if (!isLogin) {
    return (
      <p style={{ textAlign: "center", marginTop: "50px", fontSize: "16px" }}>
        请先登录...
      </p>
    );
  }

  return (
    !user_id ? <div
      style={{
        maxWidth: "500px",
        margin: "50px auto",
        padding: "20px",
        border: "1px solid #eee",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <h2 style={{ textAlign: "center", marginBottom: "30px", color: "#333" }}>
        个人信息编辑
      </h2>

      {successMsg && (
        <p style={{ color: "#4CAF50", textAlign: "center", margin: "0 0 15px 0" }}>
          {successMsg}
        </p>
      )}
      {errorMsg && (
        <p style={{ color: "#ff4444", textAlign: "center", margin: "0 0 15px 0" }}>
          {errorMsg}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* 用户名（可修改） */}
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            用户名
          </label>
          <input
            type="name"
            name="name"
            value={formData.name || ""}
            onChange={handleInputChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
            }}
            placeholder="请输入用户名"
          />
        </div>

        {/* 邮箱（可修改） */}
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            邮箱
          </label>
          <input
            type="email"
            name="email"
            value={formData.email || ""}
            onChange={handleInputChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
            }}
            placeholder="请输入邮箱"
          />
        </div>

        {/* 电话（可修改） */}
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            电话
          </label>
          <input
            type="phone"
            name="phone"
            value={formData.phone || ""}
            onChange={handleInputChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
            }}
            placeholder="请输入电话"
          />
        </div>

        {/* 头像（预览 + 上传） */}
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            头像
          </label>
          <div style={{ marginBottom: "10px" }}>
            <img
              // 修复：使用有效占位图链接
              src={formData.avatar !== "" ? formData.avatar || "https://picsum.photos/100" : "https://picsum.photos/100"}
              alt="用户头像"
              style={{
                width: "100px",
                height: "100px",
                borderRadius: "50%",
                objectFit: "cover",
                border: "1px solid #eee",
              }}
            />
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            style={{ padding: "5px", fontSize: "14px" }}
          />
        </div>

        
        {/* 密码输入框（可修改） */}
        {
          (
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            原密码
          </label>
          <input
            type="password"
            name="password"
            placeholder="请输入密码"
            value={formData.password}
            onChange={handleInputChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
            }}
          />
        </div>
          )
        }

        {/* 新密码输入框（可修改） */}
        {
          (
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            新密码
          </label>
          <input
            type="password"
            name="newPassword"
            placeholder="请输入密码"
            value={formData.newPassword}
            onChange={handleInputChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
            }}
          />
        </div>
          )
        }

        {/* 新密码验证输入框（可修改） */}
        {
          (
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            确认新密码
          </label>
          <input
            type="password"
            name="confirmPassword"
            placeholder="请输入密码"
            value={formData.confirmPassword}
            onChange={handleInputChange}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
            }}
          />
        </div>
          )
        }

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={updateProfile}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            保存修改
          </button>
          <button
            onClick={() => router.push("/")}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "#ccc",
              color: "black",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            返回首页
          </button>
        </div>

        {/* 注销按钮 */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={deleteUser}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "#c90000ff",
              color: "black",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            注销账号
          </button>
        </div>
      </div>

    </div> : 
    <div
      style={{
        maxWidth: "500px",
        margin: "50px auto",
        padding: "20px",
        border: "1px solid #eee",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <h2 style={{ textAlign: "center", marginBottom: "30px", color: "#333" }}>
        个人信息详情
      </h2>

      {successMsg && (
        <p style={{ color: "#4CAF50", textAlign: "center", margin: "0 0 15px 0" }}>
          {successMsg}
        </p>
      )}
      {errorMsg && (
        <p style={{ color: "#ff4444", textAlign: "center", margin: "0 0 15px 0" }}>
          {errorMsg}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* 用户名（只读） */}
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            用户名
          </label>
          <div
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #eee",
              fontSize: "14px",
              backgroundColor: "#f9f9f9",
              color: "#333",
            }}
          >
            {formData.name || "未设置"}
          </div>
        </div>

        {/* 邮箱（只读） */}
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            邮箱
          </label>
          <div
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #eee",
              fontSize: "14px",
              backgroundColor: "#f9f9f9",
              color: "#333",
            }}
          >
            {formData.email || "未设置"}
          </div>
        </div>

        {/* 电话（只读） */}
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            电话
          </label>
          <div
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #eee",
              fontSize: "14px",
              backgroundColor: "#f9f9f9",
              color: "#333",
            }}
          >
            {formData.phone || "未设置"}
          </div>
        </div>

        {/* 头像（只读） */}
        <div>
          <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", color: "#666" }}>
            头像
          </label>
          <div style={{ marginBottom: "10px" }}>
            <img
              src={formData.avatar !== "" ? formData.avatar || "https://picsum.photos/100" : "https://picsum.photos/100"}
              alt="用户头像"
              style={{
                width: "100px",
                height: "100px",
                borderRadius: "50%",
                objectFit: "cover",
                border: "1px solid #eee",
              }}
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={() => router.push("/")}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "#ccc",
              color: "black",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            返回首页
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileScreen;