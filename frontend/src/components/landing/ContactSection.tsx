import { Phone, Mail, MapPin, Clock, Facebook, Twitter, Instagram } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import React, { useState } from 'react';

const ContactSection = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle'|'sending'|'success'|'error'>('idle');
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3010';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    try {
      const res = await fetch(`${apiBase}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error ${res.status}: ${text}`);
      }
      setStatus('success');
      setName(''); setEmail(''); setSubject(''); setMessage('');
    } catch (err) {
      setStatus('error');
    }
    setTimeout(() => setStatus('idle'), 3000);
  }

  return (
    <section id="contact" className="py-16 bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <h2 className="font-display text-3xl font-bold text-[#0F172A] sm:text-4xl">
            Contact Us
          </h2>
          <p className="mt-3 text-lg text-gray-600">
            We'd love to hear from you. Reach out with any questions.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Contact Information */}
          <div className="space-y-6">
            <Card className="border-0 bg-white p-6 shadow-sm">
              <h3 className="font-display text-lg font-bold text-[#0F172A] mb-4">
                Get in Touch
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1E3A8A]/10">
                    <Phone className="h-5 w-5 text-[#1E3A8A]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#0F172A]">Phone</p>
                    <p className="text-sm text-gray-600">+250 791 811 475</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1E3A8A]/10">
                    <Mail className="h-5 w-5 text-[#1E3A8A]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#0F172A]">Email</p>
                    <p className="text-sm text-gray-600">ceprptumbacollege@gmail.com</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1E3A8A]/10">
                    <MapPin className="h-5 w-5 text-[#1E3A8A]" />
                  </div>
                  <div>
                    <p className="font-semibold text-[#0F172A]">Location</p>
                    <p className="text-sm text-gray-600">Tumba College Campus, Rulindo, Rwanda</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1E3A8A]/10">
                    <Clock className="h-5 w-5 text-[#1E3A8A]" />
                  </div>
                </div>
              </div>
            </Card>

            {/* Social Media */}
            <Card className="border-0 bg-white p-6 shadow-sm">
              <h3 className="font-display text-lg font-bold text-[#0F172A] mb-4">
                Follow Us
              </h3>
              <div className="flex gap-3">
                <Button size="icon" variant="outline" className="rounded-full">
                  <Facebook className="h-5 w-5 text-[#1E3A8A]" />
                </Button>
                <Button size="icon" variant="outline" className="rounded-full">
                  <Twitter className="h-5 w-5 text-[#1E3A8A]" />
                </Button>
                <Button size="icon" variant="outline" className="rounded-full">
                  <Instagram className="h-5 w-5 text-[#1E3A8A]" />
                </Button>
              </div>
            </Card>
          </div>

          {/* Contact Form */}
          <Card className="border-0 bg-white p-6 shadow-sm">
            <h3 className="font-display text-lg font-bold text-[#0F172A] mb-4">
              Send a Message
            </h3>
            
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="your@email.com" />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="How can we help?" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea 
                  id="message" 
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Your message..." 
                  rows={5}
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full bg-[#1E3A8A] text-white hover:bg-[#1E3A8A]/90"
                disabled={status === 'sending'}
              >
                {status === 'sending' ? 'Sending…' : 'Send Message'}
              </Button>

              {status === 'success' && (
                <p className="mt-2 text-sm text-green-600">Message sent successfully. You will receive a confirmation email shortly.</p>
              )}
              {status === 'error' && (
                <p className="mt-2 text-sm text-red-600">Failed to send message. Try again.</p>
              )}
            </form>
          </Card>
        </div>
      </div>
    </section>
  );
};

export default ContactSection;
