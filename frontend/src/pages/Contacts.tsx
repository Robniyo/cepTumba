import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Mail, User, MessageSquare, Calendar, Reply, Loader2 } from "lucide-react";

type Contact = {
  id: string;
  name: string;
  email?: string;
  subject?: string;
  message: string;
  is_replied: boolean;
  created_at: string;
};

type Reply = {
  id: string;
  reply_text: string;
  display_name?: string;
  created_at: string;
};

const Contacts = () => {
  const { accessToken, isReady } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3010";

  const fetchContacts = async () => {
    if (!accessToken) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    try {
      const url = `${apiBase}/contacts`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const data = await res.json();
      setContacts(data.items || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading contacts");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchReplies = async (contactId: string) => {
    setLoadingReplies(true);
    try {
      const url = `${apiBase}/contacts/${contactId}/replies`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to fetch replies");
      const data = await res.json();
      setReplies(data.replies || []);
    } catch (err) {
      console.error("Error fetching replies:", err);
      setReplies([]);
    } finally {
      setLoadingReplies(false);
    }
  };

  const handleSelectContact = (contact: Contact) => {
    setSelectedContact(contact);
    setReplyText("");
    fetchReplies(contact.id);
  };

  const handleSubmitReply = async () => {
    if (!selectedContact || !replyText.trim()) return;
    
    setSubmittingReply(true);
    try {
      const url = `${apiBase}/contacts/${selectedContact.id}/replies`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reply: replyText }),
      });
      if (!res.ok) throw new Error("Failed to submit reply");
      setReplyText("");
      await fetchReplies(selectedContact.id);
    } catch (err) {
      console.error("Error submitting reply:", err);
    } finally {
      setSubmittingReply(false);
    }
  };

  useEffect(() => {
    if (!isReady) return;
    fetchContacts();
  }, [accessToken, isReady]);

  if (!isReady) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contact Submissions"
        description="View messages submitted through the landing page contact form"
      />

      <Card className="p-6">
        {loading && (
          <div className="text-center py-8 text-gray-500">Loading contacts...</div>
        )}

        {error && (
          <div className="text-center py-8 text-red-500">Error: {error}</div>
        )}

        {!loading && !error && contacts.length === 0 && (
          <div className="text-center py-8 text-gray-500">No contact submissions yet</div>
        )}

        {!loading && !error && contacts.length > 0 && (
          <div className="space-y-4">
            {contacts.map((contact) => (
              <div key={contact.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-semibold text-lg">{contact.name}</span>
                      {contact.subject && <Badge variant="outline">{contact.subject}</Badge>}
                        {contact.is_replied && <Badge className="bg-green-100 text-green-800">Replied</Badge>}
                    </div>
                    {contact.email && (
                      <p className="text-sm text-gray-600 mb-2">
                        <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">
                          {contact.email}
                        </a>
                      </p>
                    )}
                    <p className="text-gray-700 mb-2">{contact.message}</p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(contact.created_at), "MMM dd, yyyy HH:mm")}
                    </p>
                  </div>
                  <Dialog open={selectedContact?.id === contact.id}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                          variant={contact.is_replied ? "secondary" : "outline"}
                        onClick={() => handleSelectContact(contact)}
                          disabled={contact.is_replied}
                      >
                        <Reply className="h-4 w-4 mr-2" />
                          {contact.is_replied ? "Replied" : "Reply"}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Reply to {contact.name}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 max-h-96 overflow-y-auto py-4">
                        <div className="bg-gray-50 p-3 rounded text-sm">
                          <p className="font-semibold mb-1">{contact.name}</p>
                          <p className="text-gray-600">{contact.message}</p>
                          <p className="text-xs text-gray-500 mt-2">
                            {format(new Date(contact.created_at), "MMM dd, yyyy HH:mm")}
                          </p>
                        </div>
                        
                        {loadingReplies ? (
                          <div className="text-center py-4 text-gray-500">Loading replies...</div>
                        ) : replies.length > 0 ? (
                          <div className="space-y-3">
                            <h4 className="font-semibold text-sm">Replies:</h4>
                            {replies.map((reply) => (
                              <div key={reply.id} className="bg-blue-50 p-3 rounded text-sm border-l-2 border-blue-400">
                                <p className="font-semibold text-xs text-gray-600 mb-1">
                                  {reply.display_name || "Unknown"}
                                </p>
                                <p className="text-gray-700">{reply.reply_text}</p>
                                <p className="text-xs text-gray-500 mt-2">
                                  {format(new Date(reply.created_at), "MMM dd, yyyy HH:mm")}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-center text-sm text-gray-500">No replies yet</p>
                        )}
                      </div>
                      
                      <div className="space-y-3 border-t pt-4">
                        <Textarea
                          placeholder="Write your reply..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          rows={3}
                        />
                        <DialogFooter>
                          <Button
                            onClick={() => setSelectedContact(null)}
                            variant="outline"
                          >
                            Close
                          </Button>
                          <Button
                            onClick={handleSubmitReply}
                            disabled={!replyText.trim() || submittingReply}
                          >
                            {submittingReply && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Send Reply
                          </Button>
                        </DialogFooter>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Contacts;
