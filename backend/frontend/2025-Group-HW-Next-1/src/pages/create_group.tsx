import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { BACKEND_URL, FAILURE_PREFIX, GROUP_CREATE_SUCCESS, GROUP_CREATE_FAILED } from "../constants/string";
import { Avatar, Checkbox } from "antd";
import { UserOutlined } from "@ant-design/icons";

interface Friend {
  id: number;
  userName: string;
  email: string;
}

interface FormData {
  groupName: string;
  description: string;
  selectedFriends: number[];
}

const CreateGroupScreen = () => {
  const router = useRouter();
  const { token, isLogin } = useSelector((state: RootState) => state.auth);
  
  const [formData, setFormData] = useState<FormData>({
    groupName: "",
    description: "",
    selectedFriends: [],
  });
  
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (!isLogin) {
      router.push("/login");
    }
  }, [isLogin, router]);

  // Fetch friends list
  useEffect(() => {
    if (token && isLogin) {
      fetchFriends();
    }
  }, [token, isLogin]);

  const fetchFriends = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const response = await fetch(`${BACKEND_URL}/api/user/friends/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await response.json();

      if (Number(res.code) === 0) {
        const rawFriendList = res.friends || res.friendList || [];
        const formattedFriends: Friend[] = rawFriendList.map((friend: any) => ({
          id: friend.id,
          userName: friend.username || friend.userName,
          email: friend.email || "",
        }));
        setFriends(formattedFriends);
      } else {
        setErrorMsg(res.info || "获取好友列表失败");
      }
    } catch (err) {
      setErrorMsg(FAILURE_PREFIX + String(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle input change: update form state synchronously
   * @param e Input event object
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    setErrorMsg(""); // Clear error message when user types
  };

  /**
   * Handle friend selection: toggle selected state
   * @param friendId Friend ID
   */
  const handleFriendToggle = (friendId: number) => {
    setFormData((prev) => {
      const isSelected = prev.selectedFriends.includes(friendId);
      return {
        ...prev,
        selectedFriends: isSelected
          ? prev.selectedFriends.filter((id) => id !== friendId)
          : [...prev.selectedFriends, friendId],
      };
    });
  };

  /**
   * Create group logic: frontend validation → call backend API → handle result
   */
  const createGroup = async () => {
    // 1. Frontend form validation
    if (!formData.groupName.trim()) {
      setErrorMsg("请输入群名称");
      return;
    }

    if (formData.groupName.length > 50) {
      setErrorMsg("群名称长度不能超过50个字符");
      return;
    }

    if (formData.selectedFriends.length === 0) {
      setErrorMsg("请至少选择一个好友加入群聊");
      return;
    }

    setIsCreating(true);
    setErrorMsg("");

    try {
      // 2. Call backend API to create group
      // Note: Need to confirm backend API endpoint and request format
      const response = await fetch(`${BACKEND_URL}/api/groups/create/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.groupName.trim(),
          description: formData.description.trim() || undefined,
          member_ids: formData.selectedFriends, // Need to confirm backend field name: could be member_ids, members, user_ids, etc.
        }),
      });

      // 3. Parse API response
      const res = await response.json();

      // 4. Handle success/failure logic
      if (Number(res.code) === 0) {
        // Creation successful: redirect to group chat page or group list
        const groupId = res.group?.id || res.id || res.group_id;
        if (groupId) {
          alert(GROUP_CREATE_SUCCESS);
          router.push({
            pathname: "/group_chat",
            query: {
              group_id: groupId.toString(),
              group_name: formData.groupName.trim(),
            },
          });
        } else {
          alert(GROUP_CREATE_SUCCESS);
          router.push("/group_list");
        }
      } else {
        // Creation failed: display error message from backend
        setErrorMsg(res.info || GROUP_CREATE_FAILED);
      }
    } catch (err) {
      // Network error: display generic error message
      setErrorMsg(FAILURE_PREFIX + String(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
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
        创建群聊
      </h2>

      {/* Error message area */}
      {errorMsg && (
        <p style={{ color: "#ff4444", textAlign: "center", margin: "0 0 15px 0" }}>
          {errorMsg}
        </p>
      )}

      {/* Create group form */}
      <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
        {/* Group name input */}
        <div>
          <label style={{ display: "block", marginBottom: "5px", color: "#666", fontSize: "14px" }}>
            群名称 <span style={{ color: "#ff4444" }}>*</span>
          </label>
          <input
            type="text"
            name="groupName"
            placeholder="请输入群名称"
            value={formData.groupName}
            onChange={handleInputChange}
            maxLength={50}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Group description input */}
        <div>
          <label style={{ display: "block", marginBottom: "5px", color: "#666", fontSize: "14px" }}>
            群描述（可选）
          </label>
          <textarea
            name="description"
            placeholder="请输入群描述"
            value={formData.description}
            onChange={handleInputChange}
            maxLength={200}
            rows={3}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              fontSize: "14px",
              resize: "vertical",
              boxSizing: "border-box",
              fontFamily: "inherit",
            }}
          />
        </div>

        {/* Select friends */}
        <div>
          <label style={{ display: "block", marginBottom: "10px", color: "#666", fontSize: "14px" }}>
            选择好友 <span style={{ color: "#ff4444" }}>*</span>
            <span style={{ marginLeft: "8px", fontSize: "12px", color: "#999" }}>
              （已选择 {formData.selectedFriends.length} 人）
            </span>
          </label>
          
          {loading ? (
            <p style={{ textAlign: "center", color: "#666", padding: "20px" }}>
              加载好友列表中...
            </p>
          ) : friends.length === 0 ? (
            <p style={{ textAlign: "center", color: "#999", padding: "20px" }}>
              暂无好友，请先添加好友
            </p>
          ) : (
            <div
              style={{
                maxHeight: "300px",
                overflowY: "auto",
                border: "1px solid #ddd",
                borderRadius: "4px",
                padding: "10px",
                backgroundColor: "#fafafa",
              }}
            >
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  onClick={() => handleFriendToggle(friend.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "10px",
                    marginBottom: "8px",
                    backgroundColor: "white",
                    borderRadius: "4px",
                    cursor: "pointer",
                    border: formData.selectedFriends.includes(friend.id)
                      ? "2px solid #2196F3"
                      : "1px solid #ddd",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (!formData.selectedFriends.includes(friend.id)) {
                      e.currentTarget.style.borderColor = "#2196F3";
                      e.currentTarget.style.backgroundColor = "#f0f7ff";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!formData.selectedFriends.includes(friend.id)) {
                      e.currentTarget.style.borderColor = "#ddd";
                      e.currentTarget.style.backgroundColor = "white";
                    }
                  }}
                >
                  <Checkbox
                    checked={formData.selectedFriends.includes(friend.id)}
                    onChange={() => handleFriendToggle(friend.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Avatar
                    icon={<UserOutlined />}
                    style={{ backgroundColor: "#2196F3" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: "14px" }}>
                      {friend.userName}
                    </p>
                    {friend.email && (
                      <p style={{ margin: "2px 0 0 0", color: "#999", fontSize: "12px" }}>
                        {friend.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Create button */}
        <button
          onClick={createGroup}
          disabled={
            !formData.groupName.trim() ||
            formData.selectedFriends.length === 0 ||
            isCreating
          }
          style={{
            padding: "12px",
            backgroundColor: "#2196F3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "16px",
            opacity:
              !formData.groupName.trim() ||
              formData.selectedFriends.length === 0 ||
              isCreating
                ? 0.6
                : 1,
          }}
        >
          {isCreating ? "创建中..." : "创建群聊"}
        </button>

        {/* Cancel button */}
        <button
          onClick={() => router.back()}
          style={{
            padding: "10px",
            backgroundColor: "#f5f5f5",
            color: "#333",
            border: "1px solid #ddd",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
};

export default CreateGroupScreen;

