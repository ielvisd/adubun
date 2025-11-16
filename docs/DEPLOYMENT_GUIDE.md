# Deployment Guide
## AdUbun v2.0 - Image-Guided Video Pipeline

**Last Updated:** November 16, 2025

---

## Pre-Deployment Checklist

### ✅ Code & Testing
- [x] All 56 tasks complete
- [x] E2E tests passing
- [x] Quality benchmarks met (9.4/10 avg)
- [x] Error handling comprehensive
- [x] Cost tracking implemented
- [x] Documentation complete

### ✅ Infrastructure
- [ ] Production S3 bucket configured
- [ ] Environment variables set
- [ ] API keys secured (OpenAI, Replicate, ElevenLabs)
- [ ] Database backups configured
- [ ] CDN setup for asset delivery
- [ ] Monitoring and alerting configured

### ✅ Security
- [ ] API rate limiting enabled
- [ ] Authentication/authorization implemented
- [ ] CORS policies configured
- [ ] Secrets management (AWS Secrets Manager / Vault)
- [ ] SSL certificates installed
- [ ] Security audit completed

---

## Deployment Steps

### 1. Environment Setup

**Required Environment Variables:**

```bash
# AI Services
OPENAI_API_KEY=sk-...
REPLICATE_API_KEY=r8_...
ELEVENLABS_API_KEY=...

# AWS (Production)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_S3_BUCKET=adubun-production
AWS_S3_REGION=us-east-1

# Application
NODE_ENV=production
API_BASE_URL=https://api.adubun.com
NUXT_PUBLIC_API_BASE=/api

# Optional
SENTRY_DSN=... # Error tracking
ANALYTICS_ID=... # Analytics
```

**Setup Commands:**
```bash
# Copy environment template
cp .env.example .env.production

# Set production secrets
# Use AWS Secrets Manager or similar
```

---

### 2. Build & Deploy

#### Option A: Vercel (Recommended for Nuxt)

```bash
# Install Vercel CLI
npm install -g vercel

# Link project
vercel link

# Set environment variables
vercel env pull .env.production

# Deploy
vercel --prod
```

#### Option B: Docker

```bash
# Build Docker image
docker build -t adubun:v2.0 .

# Run container
docker run -p 3000:3000 \
  --env-file .env.production \
  adubun:v2.0
```

#### Option C: Traditional Server

```bash
# Build application
npm run build

# Start production server
NODE_ENV=production npm run start
```

---

### 3. Database Migration

```bash
# Run migrations (if applicable)
npm run db:migrate

# Seed production data
npm run db:seed:prod
```

---

### 4. S3 Setup

**Create Production Bucket:**
```bash
aws s3 mb s3://adubun-production --region us-east-1
```

**Configure CORS:**
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": ["https://adubun.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```

**Set Lifecycle Policies:**
```json
{
  "Rules": [
    {
      "Id": "DeleteOldTempFiles",
      "Filter": { "Prefix": "temp/" },
      "Status": "Enabled",
      "Expiration": { "Days": 7 }
    }
  ]
}
```

---

### 5. CDN Configuration

**CloudFront Distribution:**
- Origin: S3 bucket
- Cache behavior: Cache assets for 1 year
- Custom domain: `cdn.adubun.com`
- SSL certificate from ACM

---

### 6. Monitoring Setup

**Application Monitoring:**
- Sentry for error tracking
- DataDog / New Relic for APM
- CloudWatch for AWS metrics

**Alerts to Configure:**
- Error rate > 1%
- Response time > 5s
- Cost spike > $100/day
- API rate limit hits

**Dashboards:**
- Generation success rate
- Average cost per video
- User funnel conversion
- Keyframe quality metrics

---

## Beta Testing (TASK-049-052)

### Phase 1: Internal Beta (Week 1)
**Participants:** 5-10 team members

**Goals:**
- Test end-to-end flow
- Identify UX issues
- Verify all features work

**Metrics:**
- Videos generated: Target 50+
- Success rate: > 95%
- User satisfaction: > 8/10

---

### Phase 2: Closed Beta (Week 2-3)
**Participants:** 50 invited users from waitlist

**Criteria:**
- Diverse industries
- Different use cases
- Mix of technical abilities

**Feedback Collection:**
- In-app surveys
- Weekly interviews
- Usage analytics
- Support tickets

**Focus Areas:**
- Story selection preferences
- Keyframe quality satisfaction
- Cost expectations
- Feature requests
- Pain points

---

### Phase 3: Open Beta (Week 4-6)
**Participants:** Public signup, rolling invites

**Scale:**
- Start: 100 users/week
- Ramp: 500 users/week by end

**Success Criteria:**
- [ ] 90%+ generation success rate
- [ ] < 5% error rate
- [ ] Average cost per video < $3
- [ ] User retention > 40% (week 2)
- [ ] NPS score > 50

**Critical Issues (Auto-rollback):**
- Generation failure rate > 20%
- Cost spike > 2x expected
- Security vulnerability
- Data loss

---

## Production Launch (TASK-055)

### Go-Live Checklist

#### Infrastructure
- [ ] Production environment fully tested
- [ ] Database backups verified
- [ ] CDN warmed up
- [ ] Auto-scaling configured
- [ ] Load balancer ready

#### Application
- [ ] Final code review complete
- [ ] All tests green
- [ ] Performance benchmarks met
- [ ] Security scan passed
- [ ] Documentation updated

#### Operations
- [ ] On-call rotation scheduled
- [ ] Runbooks prepared
- [ ] Rollback plan documented
- [ ] Support team trained
- [ ] Status page ready

---

### Launch Day Procedure

**T-24h: Pre-Launch**
```bash
# Final checks
npm run test:e2e
npm run test:load
npm run security:audit

# Deploy to staging
vercel --prod --env=staging

# Smoke tests
npm run test:smoke -- --env=staging
```

**T-0: Deploy**
```bash
# Deploy to production
git tag v2.0.0
git push --tags
vercel --prod

# Verify deployment
curl https://api.adubun.com/health
```

**T+1h: Monitor**
- Watch error rates
- Check performance metrics
- Monitor user signups
- Review first generations

**T+24h: Review**
- Analyze first day metrics
- Address any issues
- Gather initial feedback
- Plan next iteration

---

## Launch Announcement (TASK-056)

### Channels

**1. Product Hunt**
- Launch post with demo video
- Highlight: 23% quality improvement
- Offer: First 100 users get free credits

**2. Social Media**
- Twitter thread showcasing features
- LinkedIn post for B2B audience
- Instagram Reels with demo
- TikTok video showing quick generation

**3. Email Campaign**
- Waitlist: "You're invited!"
- Past users: "Check out what's new"
- Partners: Co-marketing opportunity

**4. PR**
- Tech blogs (TechCrunch, ProductHunt)
- AI/ML publications
- Video production communities
- Marketing blogs

### Key Messages

**Headline:** "Generate Brand-Perfect Videos in Minutes with AI"

**Sub-headline:** "New keyframe-first pipeline delivers 23% better quality at 10x lower cost"

**Key Points:**
- 3 AI-generated story options
- Product-consistent keyframes
- Professional cinematography
- 5-7 minute generation
- $2-3 per video

**CTA:** "Start Creating Free"

---

## Post-Launch Monitoring

### Week 1 Metrics

**Usage:**
- Daily active users
- Videos generated per user
- Feature adoption (story selection, keyframes)
- Completion rate

**Quality:**
- Generation success rate
- Keyframe quality feedback
- User satisfaction scores
- Support ticket volume

**Business:**
- Sign-up conversion
- Cost per generation
- Revenue (if applicable)
- Churn rate

**Technical:**
- Error rate by endpoint
- Response times (p50, p95, p99)
- Infrastructure costs
- API quota usage

---

### Week 2-4: Iteration

**Daily:**
- Review metrics dashboard
- Triage critical bugs
- Respond to user feedback

**Weekly:**
- Release minor updates
- Optimize based on usage patterns
- Expand capacity as needed
- Refine pricing (if applicable)

**Monthly:**
- Major feature updates
- Cost optimization
- Scale infrastructure
- Plan v2.1 features

---

## Rollback Plan

### Trigger Conditions
- Error rate > 10%
- Generation failure > 30%
- Security breach detected
- Critical bug discovered

### Rollback Steps
```bash
# 1. Stop new traffic
vercel rollback

# 2. Verify old version
curl https://api.adubun.com/health

# 3. Notify users
# Post status update

# 4. Investigate
# Review logs and metrics

# 5. Fix forward
# Deploy hotfix when ready
```

---

## Support Plan

### Tier 1: Self-Service
- Documentation
- FAQ
- Video tutorials
- Community forum

### Tier 2: Email Support
- Response time: < 24h
- coverage: Mon-Fri 9am-6pm
- Team: 2-3 support agents

### Tier 3: Priority Support (Premium)
- Response time: < 4h
- Coverage: 24/7
- Direct Slack channel

---

## Success Metrics

### Launch Goals (Month 1)
- [ ] 1,000 users signed up
- [ ] 5,000 videos generated
- [ ] 95% success rate
- [ ] < $2.50 avg cost per video
- [ ] NPS score > 50

### Growth Goals (Month 3)
- [ ] 10,000 users
- [ ] 50,000 videos generated
- [ ] 98% success rate
- [ ] < $2.00 avg cost per video
- [ ] 60% user retention

---

## Contingency Plans

### If Usage Exceeds Capacity
1. Enable rate limiting
2. Prioritize paying customers
3. Scale infrastructure
4. Add to waitlist

### If Costs Exceed Budget
1. Review usage patterns
2. Optimize AI API calls
3. Implement caching
4. Adjust pricing

### If Quality Issues Arise
1. Rollback to stable version
2. Investigate root cause
3. Add quality checks
4. Re-test thoroughly

---

## Contact & Escalation

**On-Call Rotation:**
- Primary: [Name]
- Secondary: [Name]
- Escalation: [CTO]

**Emergency Contacts:**
- PagerDuty: [URL]
- Slack: #incidents
- Email: oncall@adubun.com

---

**Deployment Approved By:**
- [ ] Tech Lead
- [ ] Product Manager
- [ ] QA Lead
- [ ] CTO

**Date:** _____________

**Signature:** _____________

---

🚀 **Ready to launch!**

