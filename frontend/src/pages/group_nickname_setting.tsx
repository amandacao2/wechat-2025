import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { BACKEND_URL, FAILURE_PREFIX } from "../constants/string";
import { Avatar, Button, Card, Input, message, Typography } from "antd";
import { ArrowLeftOutlined, UserOutlined } from "@ant-design/icons";

const { Text } = Typography;

const GroupNicknameSettingScreen = () => {
  const router = useRouter();
  const { group_id, group_name, current_nickname } = router.query;
  const { token } = useSelector((state: RootState) => state.auth);
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // const [currentUserId, setCurrentUserId] = useState(0);

  // 获取当前用户ID
  useEffect(() => {
    if (typeof window === "undefined") return;
    const authInfo = window.localStorage.getItem("authInfo");
    if (authInfo) {
      try {
        // const { user_id } = JSON.parse(authInfo);
        // setCurrentUserId(user_id || 0);
        // Handle Next.js query parameter (can be string | string[] | undefined)
        const nicknameValue = Array.isArray(current_nickname) 
          ? current_nickname[0] || "" 
          : (current_nickname || "");
        setNickname(nicknameValue);
      } catch (err) {
        console.error("解析authInfo失败:", err);
        message.error("用户信息解析失败");
        router.push("/group_list");
      }
    } else {
      message.error("未登录，即将跳转登录页");
      router.push("/login");
    }
  }, [router, current_nickname]);

  // 保存群昵称
  const saveNickname = async () => {
    if (!group_id || !token) {
      message.error("群信息或登录状态无效");
      return;
    }
    
    // Validate length if nickname is provided (but allow empty string to clear)
    if (nickname.length > 50) {
      message.error("群昵称不能超过50个字符");
      return;
    }
    
    setLoading(true);
    setErrorMsg("");
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/members/nickname/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nickname: nickname.trim() }),
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        message.success(nickname.trim() ? "群昵称设置成功" : "群昵称已清除");
        router.back();
      } else {
        setErrorMsg(res.info || "设置失败");
        message.error(res.info || "设置失败");
      }
    } catch (err) {
      const errStr = FAILURE_PREFIX + String(err);
      setErrorMsg(errStr);
      message.error(errStr);
    } finally {
      setLoading(false);
    }
  };

  if (!group_id || typeof group_name !== "string") {
    return (
      <div style={{ textAlign: "center", marginTop: "100px", color: "#ff4444" }}>
        <p>群信息无效，即将返回群列表</p>
        <Button onClick={() => router.push("/group_list")} style={{ marginTop: "20px" }}>
          返回群列表
        </Button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "500px", margin: "20px auto", padding: "0 20px" }}>
      {/* 顶部导航 */}
      <div style={{ display: "flex", alignItems: "center", margin: "20px 0" }}>
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => router.back()}
          style={{ marginRight: "16px" }}
        />
        <h2 style={{ margin: 0, color: "#333" }}>{group_name} - 群昵称设置</h2>
      </div>

      <Card>
        {/* 预览区域 */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px", padding: "16px", backgroundColor: "#f9f9f9", borderRadius: "8px" }}>
          <Avatar icon={<UserOutlined />} size="large" />
          <div>
            <Text strong style={{ fontSize: "16px" }}>群内显示</Text>
            <div style={{ marginTop: "8px", fontSize: "14px" }}>
              你在 <Text strong>{group_name}</Text> 中的昵称：
              <Text strong style={{ marginLeft: "8px", color: "#2196F3" }}>
                {nickname || "未设置"}
              </Text>
            </div>
          </div>
        </div>

        {/* 输入区域 */}
        <div style={{ marginBottom: "24px" }}>
          <Input
            placeholder="请输入群昵称（最多50个字符，留空可清除昵称）"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={50}
            style={{ fontSize: "14px" }}
          />
          <p style={{ marginTop: "8px", marginBottom: 0, fontSize: "12px", color: "#999" }}>
            提示：群昵称仅在当前群内生效，不影响其他群聊或个人资料
          </p>
        </div>

        {/* 错误提示 */}
        {errorMsg && (
          <p style={{ marginBottom: "16px", color: "#ff4444", fontSize: "14px" }}>
            {errorMsg}
          </p>
        )}

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: "16px" }}>
          <Button onClick={() => router.back()} style={{ flex: 1 }}>
            取消
          </Button>
          <Button onClick={saveNickname} type="primary" loading={loading} style={{ flex: 1 }}>
            保存
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default GroupNicknameSettingScreen;