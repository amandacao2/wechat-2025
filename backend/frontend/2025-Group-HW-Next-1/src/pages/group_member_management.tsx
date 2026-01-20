import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { BACKEND_URL, FAILURE_PREFIX } from "../constants/string";
import { Avatar, Button, Card, List, message, Popconfirm, Spin, Tag } from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  CrownOutlined,
  UserOutlined,
  UpOutlined,        // 替换 UpgradeOutlined
  DownOutlined,      // 替换 DowngradeOutlined
} from "@ant-design/icons";

// 群成员类型
interface GroupMember {
  userId: number;
  username: string;
  nickname: string;
  avatar?: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
}

// 群信息类型
interface GroupInfo {
  id: number;
  name: string;
  owner: { userId: number; nickname: string };
}

const GroupMemberManagementScreen = () => {
  const router = useRouter();
  const { group_id } = router.query;
  const { token } = useSelector((state: RootState) => state.auth);
  const [groupInfo, setGroupInfo] = useState<GroupInfo | undefined>(undefined);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  // const [errorMsg, setErrorMsg] = useState("");
  const [currentUserId, setCurrentUserId] = useState(0);
  const [transferTarget, setTransferTarget] = useState<number | null>(null);
  const [pendingRequests, setPendingRequests] = useState<number[]>([]);

  // 获取当前用户ID
  useEffect(() => {
    if (typeof window === "undefined") return;
    const authInfo = window.localStorage.getItem("authInfo");
    if (authInfo) {
      try {
        setCurrentUserId(JSON.parse(authInfo).user_id || 0);
      } catch (err) {
        console.error("解析authInfo失败:", err);
      }
    }
  }, []);

  // 拉取群信息和成员列表
  const fetchGroupData = async () => {
    if (!group_id || !token) return;
    setLoading(true);
    // setErrorMsg("");
    try {
      // 拉取群基本信息
      const groupRes = await fetch(`${BACKEND_URL}/api/groups/${group_id}/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const groupData = await groupRes.json();
      if (Number(groupData.code) !== 0) throw new Error(groupData.info || "获取群信息失败");

      // 拉取群成员列表
      const membersRes = await fetch(`${BACKEND_URL}/api/groups/${group_id}/members/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const membersData = await membersRes.json();
      if (Number(membersData.code) !== 0) throw new Error(membersData.info || "获取群成员失败");

      setGroupInfo({
        id: groupData.results.id,
        name: groupData.results.name,
        owner: groupData.results.owner,
      });
      setMembers((membersData.results || []).map((it : GroupMember) => {
        const {avatar, ...tmp} = it;
        return {...tmp, avatar: avatar === null ? "" : `${BACKEND_URL}${avatar}`};
      }));
    } catch (err) {
      const errStr = FAILURE_PREFIX + String(err);
      // setErrorMsg(errStr);
      message.error(errStr);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (group_id && token) fetchGroupData();
  }, [group_id, token]);

  // 权限判断
  const isOwner = () => groupInfo?.owner.userId === currentUserId;
  const isAdmin = () => members.find(m => m.userId === currentUserId)?.role === "admin";
  const canManageMembers = () => isOwner() || isAdmin();

  // 设置管理员
  const setAdmin = async (userId: number) => {
    if (!group_id || !canManageMembers()) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/members/${userId}/set_admin/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_admin: true }),
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        setMembers(prev =>
          prev.map(m =>
            m.userId === userId ? { ...m, role: "admin" } : m
          )
        );
        message.success("已设为管理员");
      } else {
        message.error(res.info || "设置失败");
      }
    } catch (err) {
      message.error(FAILURE_PREFIX + String(err));
    }
  };

  // 撤销管理员
  const revokeAdmin = async (userId: number) => {
    if (!group_id || !isOwner()) return; // 仅群主可撤销管理员
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/members/${userId}/set_admin/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_admin: false }),
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        setMembers(prev =>
          prev.map(m =>
            m.userId === userId ? { ...m, role: "member" } : m
          )
        );
        message.success("已撤销管理员权限");
      } else {
        message.error(res.info || "撤销失败");
      }
    } catch (err) {
      message.error(FAILURE_PREFIX + String(err));
    }
  };

  // 移除群员
  const removeMember = async (userId: number, nickname: string) => {
    if (!group_id || !canManageMembers()) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/members/${userId}/remove/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        setMembers(prev => prev.filter(m => m.userId !== userId));
        message.success(`已移除成员 ${nickname}`);
      } else {
        message.error(res.info || "移除失败");
      }
    } catch (err) {
      message.error(FAILURE_PREFIX + String(err));
    }
  };

  // 转让群主
  const confirmTransfer = async () => {
    if (!group_id || !transferTarget || !isOwner()) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/groups/${group_id}/transfer_owner/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ new_owner_id: transferTarget }),
      });
      const res = await response.json();
      if (Number(res.code) === 0) {
        setGroupInfo(prev => prev ? { ...prev, owner: { userId: transferTarget, nickname: members.find(m => m.userId === transferTarget)?.nickname || "" } } : undefined);
        setMembers(prev =>
          prev.map(m => {
            if (m.userId === transferTarget) return { ...m, role: "owner" };
            if (m.userId === currentUserId) return { ...m, role: "member" };
            return m;
          })
        );
        setTransferTarget(null);
        message.success("群主转让成功");
      } else {
        message.error(res.info || "转让失败");
      }
    } catch (err) {
      message.error(FAILURE_PREFIX + String(err));
    }
  };
  
  const handleAddFriend = async (userId: any, userName: any) => {
    // 避免重复发送请求
    if (pendingRequests.includes(userId)) return;

    try {
      // 1. 调试日志：打印 userId 原始值和类型，定位后端返回格式问题
      console.log("=== Friend Request Debug ===");
      console.log("User ID raw value:", userId);
      console.log("User ID type:", typeof userId);

      // 2. 严格校验并转换 to_user_id：确保是有效正整数
      const toUserId = Number(userId);
      if (isNaN(toUserId) || !Number.isInteger(toUserId) || toUserId <= 0) {
        console.error("Invalid user ID:", userId, "→ Must be positive integer");
        message.error(`用户ID格式错误（${userId}），请刷新页面重试`);
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
          Authorization: `Bearer ${token || ""}`,
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
        setPendingRequests(prev => [...prev, userName]);
      } else {
        // 显示后端返回的具体错误（如“目标用户不存在”“已发送过请求”）
        message.error(res.info || "Failed to send friend request.");
      }
    } catch (err) {
      console.error("Error sending friend request:", err);
      message.error("Network error. Please check console for details.");
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", marginTop: "100px" }}>
        <Spin size="large" />
        <p style={{ marginTop: "16px", color: "#666" }}>正在加载群成员...</p>
      </div>
    );
  }

  if (!groupInfo || !group_id) {
    return (
      <div style={{ textAlign: "center", marginTop: "100px", color: "#ff4444" }}>
        <p>群信息无效，即将返回群详情</p>
        <Button onClick={() => router.push(`/group_detail?group_id=${group_id}`)} style={{ marginTop: "20px" }}>
          返回群详情
        </Button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "600px", margin: "20px auto", padding: "0 20px" }}>
      {/* 顶部导航 */}
      <div style={{ display: "flex", alignItems: "center", margin: "20px 0" }}>
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => router.back()}
          style={{ marginRight: "16px" }}
        />
        <h2 style={{ margin: 0, color: "#333" }}>{groupInfo.name} - 成员管理</h2>
      </div>

      {/* 权限提示 */}
      <Card style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <UserOutlined style={{ color: "#2196F3" }} />
          <p style={{ margin: 0, fontSize: "14px" }}>
            您的身份：{isOwner() ? <Tag color="red">群主</Tag> : isAdmin() ? <Tag color="blue">管理员</Tag> : <Tag>普通成员</Tag>}
            {canManageMembers() && <span style={{ marginLeft: "8px", color: "#666" }}>（可管理成员）</span>}
          </p>
        </div>
      </Card>

      {/* 群主转让区域 */}
      {isOwner() && (
        <Card style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h4 style={{ margin: 0, fontSize: "16px", color: "#333" }}>
              <CrownOutlined style={{ color: "#ff4444", marginRight: "8px" }} />
              群主转让
            </h4>
            <Popconfirm
              title={`确定将群主转让给 ${members.find(m => m.userId === transferTarget)?.nickname || "选中成员"} 吗？`}
              open={transferTarget !== null}
              onConfirm={confirmTransfer}
              onCancel={() => setTransferTarget(null)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="primary" danger disabled={!transferTarget}>
                确认转让
              </Button>
            </Popconfirm>
          </div>
        </Card>
      )}

      {/* 成员列表 */}
      <Card>
        <List
          dataSource={members}
          renderItem={(member) => (
            <List.Item
              key={member.userId}
              actions={[
                // 群主转让按钮（仅群主对普通成员/管理员显示）
                isOwner() && member.userId !== currentUserId && (
                  <Button
                    type="text"
                    size="small"
                    style={{ color: transferTarget === member.userId ? "#ff4444" : "#2196F3" }}
                    onClick={() => setTransferTarget(member.userId)}
                  >
                    {transferTarget === member.userId ? "已选中" : "转让群主"}
                  </Button>
                ),
                // 管理员操作（设为/撤销管理员）- 仅群主可操作
                isOwner() && member.userId !== currentUserId && member.role !== "owner" && (
                  member.role === "admin" ? (
                    <Button
                      type="text"
                      size="small"
                      icon={<DownOutlined />}
                      style={{ color: "#ff4444" }}
                      onClick={() => revokeAdmin(member.userId)}
                    >
                      撤销管理员
                    </Button>
                  ) : (
                    <Button
                      type="text"
                      size="small"
                      icon={<UpOutlined />}
                      style={{ color: "#2196F3" }}
                      onClick={() => setAdmin(member.userId)}
                    >
                      设为管理员
                    </Button>
                  )
                ),
                // 移除成员按钮（不显示群主和自己）
                canManageMembers() && member.userId !== groupInfo.owner.userId && member.userId !== currentUserId && (
                  <Popconfirm
                    title={`确定移除成员 ${member.nickname} 吗？`}
                    onConfirm={() => removeMember(member.userId, member.nickname)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<DeleteOutlined />}
                      style={{ color: "#ff4444" }}
                    >
                      移除
                    </Button>
                  </Popconfirm>
                ),
                // 添加好友按钮（不显示自己）
                member.userId !== currentUserId && (
                  <Button
                    type="text"
                    size="small"
                    style={{ color: "#2196F3" }}
                    onClick={() => handleAddFriend(member.userId, member.username)}
                  >
                    添加好友
                  </Button>
                )
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Avatar 
                    src={member.avatar === "" ? "https://picsum.photos/100" : member.avatar}
                    style={{ width: "40px", height: "40px" }}
                    onClick={() => router.push(`/profile?user_id=${member.userId}`)}
                  />
                }
                title={
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {member.nickname}
                    {member.role === "owner" && <Tag color="red">群主</Tag>}
                    {member.role === "admin" && <Tag color="blue">管理员</Tag>}
                  </div>
                }
                description={`@${member.username} | 加入时间: ${new Date(member.joined_at).toLocaleDateString()}`}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

export default GroupMemberManagementScreen;