import { useState } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { BACKEND_URL, FAILURE_PREFIX } from "../constants/string";
import { Input, Button, List, Card, message } from "antd";
import { UserOutlined, MailOutlined } from "@ant-design/icons";

// 接口定义：适配后端返回的整数 id（JSON 序列化后为 string，需前端转换）
interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  createdAt?: string;
}

const SearchScreen = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();
  const authInfo = useSelector((state: RootState) => state.auth);
  const [pendingRequests, setPendingRequests] = useState<string[]>([]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setErrorMsg("");
  };

  const searchUsers = async () => {
    const term = searchTerm.trim();

    if (!term) {
      setErrorMsg("Please enter a username to search.");
      return;
    }

    if (term.length < 2) {
      setErrorMsg("Search keyword must be at least 2 characters.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setHasSearched(true);

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/user/search/?username=${encodeURIComponent(term)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(authInfo.token && { Authorization: `Bearer ${authInfo.token}` }),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const res = await response.json();
      
      if (Number(res.code) === 0) {
        const users = res.data?.users || res.users || [];
        // 打印后端返回的用户列表，确认 id 格式
        console.log("Backend returned users:", users);
        setSearchResults(users.map((user: any) => {
          const {avatar, ...tmp} = user;
          return {...tmp, avatar: avatar === null ? "" : `${BACKEND_URL}${avatar}`};
        }));
        
        if (users.length === 0) {
          message.info("No matching users found.");
        }
      } else {
        setErrorMsg(res.info || "Search failed. Please try again.");
        setSearchResults([]);
      }

    } catch (err) {
      setErrorMsg(FAILURE_PREFIX + String(err));
      setSearchResults([]);
      message.error("Search failed. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") searchUsers();
  };

  const handleUserClick = (user: User) => {
    router.push({
      pathname: "/profile",
      query: {
          user_id: user.id
      }}
    );
  };
  
  /**
   * 发送好友请求：增强参数校验 + 调试日志
  */
  const handleAddFriend = async (user: User) => {
    // 避免重复发送请求
    if (pendingRequests.includes(user.username)) return;

    try {
      // 1. 调试日志：打印 user.id 原始值和类型，定位后端返回格式问题
      console.log("=== Friend Request Debug ===");
      console.log("User ID raw value:", user.id);
      console.log("User ID type:", typeof user.id);

      // 2. 严格校验并转换 to_user_id：确保是有效正整数
      const toUserId = Number(user.id);
      if (isNaN(toUserId) || !Number.isInteger(toUserId) || toUserId <= 0) {
        console.error("Invalid user ID:", user.id, "→ Must be positive integer");
        message.error(`用户ID格式错误（${user.id}），请刷新页面重试`);
        return;
      }

      // 3. 调试日志：打印最终发送的请求体
      const requestBody = { to_user_id: toUserId };
      console.log("Sending friend request body:", requestBody);

      // 4. 发送请求
      const response = await fetch(`${BACKEND_URL}/api/user/friend-request/send/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // 确保 Token 存在，缺失时提示登录
          Authorization: `Bearer ${authInfo.token || ""}`,
        },
        body: JSON.stringify(requestBody),
      });

      // 5. 处理后端响应：优先解析 JSON，非 JSON 时捕获错误
      const contentType = response.headers.get("content-type");
      let res;
      if (contentType && contentType.includes("application/json")) {
        res = await response.json();
        console.log("Friend request response:", res);
      } else {
        const rawRes = await response.text();
        console.error("Backend non-JSON response:", rawRes);
        throw new Error("Backend returned non-JSON data");
      }

      // 6. 处理响应结果
      if (Number(res.code) === 0) {
        message.success("Friend request sent successfully!");
        setPendingRequests(prev => [...prev, user.username]);
      } else {
        // 显示后端返回的具体错误（如“目标用户不存在”“已发送过请求”）
        message.error(res.info || "Failed to send friend request.");
      }
    } catch (err) {
      console.error("Error sending friend request:", err);
      message.error("Network error. Please check console for details.");
    }
  };

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "50px auto",
        padding: "20px",
        border: "1px solid #eee",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
      }}
    >
      <h2 style={{ textAlign: "center", marginBottom: "30px", color: "#333" }}>
        Search Users
      </h2>

      {/* Search Bar */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <Input
          placeholder="Search by username..."
          value={searchTerm}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          size="large"
        />
        <Button type="primary" onClick={searchUsers} loading={loading} size="large">
          Search
        </Button>
      </div>

      {/* Error message */}
      {errorMsg && (
        <p style={{ color: "#ff4444", textAlign: "center", margin: "10px 0" }}>
          {errorMsg}
        </p>
      )}

      {/* Search results */}
      {searchResults.length > 0 && (
        <>
          <h3 style={{ marginBottom: "10px", color: "#666" }}>
            Found {searchResults.length} user(s)
          </h3>
          <List
            grid={{ gutter: 16, column: 1 }}
            dataSource={searchResults}
            renderItem={(user) => (
              <List.Item key={user.id}>
                <Card
                  hoverable
                  onClick={() => handleUserClick(user)}
                  style={{
                    borderRadius: "8px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    padding: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between", 
                    }}
                  >
                    {/* User info */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ marginBottom: "0px" , marginRight: "14px"}}>
                        <img
                          src={user.avatar !== "" ? user.avatar || "https://picsum.photos/100" : "https://picsum.photos/100"}
                          alt="用户头像"
                          style={{
                            width: "60px",
                            height: "60px",
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "1px solid #eee",
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", marginBottom: "6px" }}>
                          <UserOutlined style={{ marginRight: "8px", color: "#1890ff" }} />
                          <strong>{user.username}</strong>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", color: "#666" }}>
                          <MailOutlined style={{ marginRight: "8px" }} />
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </div>

                    {/* Add Friend button */}
                    <Button
                      type="primary"
                      size="middle"
                      disabled={pendingRequests.includes(user.username)}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddFriend(user);
                      }}
                    >
                      {pendingRequests.includes(user.username) ? "Request Sent" : "Add Friend"}
                    </Button>
                  </div>
                </Card>
              </List.Item>
            )}
          />
        </>
      )}

      {/* No results message */}
      {hasSearched && searchResults.length === 0 && !loading && searchTerm && !errorMsg && (
        <div style={{ textAlign: "center", color: "#999", marginTop: "40px" }}>
          No matching users found.
        </div>
      )}

      {/* Back button */}
      <div style={{ textAlign: "center", marginTop: "30px" }}>
        <Button onClick={() => router.push("/")} size="middle">
          Back to Home
        </Button>
      </div>
    </div>
  );
};

export default SearchScreen;