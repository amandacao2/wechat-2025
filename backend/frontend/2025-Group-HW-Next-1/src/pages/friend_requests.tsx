import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { BACKEND_URL } from "../constants/string";
import { List, Card, Button, message } from "antd";
import { UserOutlined, MailOutlined } from "@ant-design/icons";

// 修复：将 avatar?: string | null 改为 avatar?: string | undefined（符合 ESLint no-restricted-syntax 规则）
interface FriendRequest {
  request_id: number;
  from_user: { id: number; userName: string; email: string; avatar?: string | undefined };
  created_at: string;
  note?: string;
}

const FriendRequestsScreen = () => {
  const authInfo = useSelector((state: RootState) => state.auth);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);

  /** Fetch all pending friend requests (sent TO the current user) */
  const fetchFriendRequests = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/friend-requests/pending/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authInfo.token}`,
        },
      });

      const res = await response.json();
      console.log("Fetched pending friend requests:", res);

      if (res.code === 0) {
        // 修复：将 null 替换为 undefined（符合项目 ESLint 配置）
        setRequests(res.pending_requests || []);
      } else {
        message.error(res.info || "Failed to load friend requests.");
      }
    } catch (err) {
      console.error("Error fetching friend requests:", err);
      message.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /** Accept or reject a friend request */
  const respondToRequest = async (requestId: number, action: "accept" | "reject") => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/friend-request/respond/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authInfo.token}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          action, // "accept" or "reject"
        }),
      });

      const res = await response.json();
      console.log("Responded to friend request:", res);

      if (res.code === 0) {
        message.success(
          action === "accept"
            ? "Friend request accepted!"
            : "Friend request rejected."
        );
        fetchFriendRequests(); // refresh the list
      } else {
        message.error(res.info || "Failed to update friend request.");
      }
    } catch (err) {
      console.error("Error updating friend request:", err);
      message.error("Network error. Please try again.");
    }
  };

  useEffect(() => {
    fetchFriendRequests();
  }, []);

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
        Incoming Friend Requests
      </h2>

      <List
        loading={loading}
        dataSource={requests}
        renderItem={(req) => (
          <List.Item>
            <Card
              style={{
                borderRadius: "8px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                {/* Sender info */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: "6px" }}>
                    <UserOutlined style={{ marginRight: "8px", color: "#1890ff" }} />
                    <strong>{req.from_user.userName}</strong>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", color: "#666" }}>
                    <MailOutlined style={{ marginRight: "8px" }} />
                    <span>{req.from_user.email}</span>
                  </div>
                </div>

                {/* Accept / Reject buttons */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <Button
                    type="primary"
                    onClick={() => respondToRequest(req.request_id, "accept")}
                  >
                    Accept
                  </Button>
                  <Button
                    danger
                    onClick={() => respondToRequest(req.request_id, "reject")}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          </List.Item>
        )}
      />

      {/* Optional empty state */}
      {!loading && requests.length === 0 && (
        <p style={{ textAlign: "center", color: "#999", marginTop: "30px" }}>
          No pending friend requests.
        </p>
      )}
    </div>
  );
};

export default FriendRequestsScreen;