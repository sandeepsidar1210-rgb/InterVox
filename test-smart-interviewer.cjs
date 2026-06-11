const http = require('http');

function makeRequest(path, body) {
  const data = JSON.stringify(body);
  
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', (d) => responseBody += d);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseBody));
        } catch {
          resolve({ error: 'Parse error', body: responseBody.substring(0, 200) });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ error: e.message });
    });
    req.write(data);
    req.end();
  });
}

(async () => {
  console.log('🎯 Testing Smart Interviewer: Varied Reactions & Cross-Questions\n');
  console.log('=' .repeat(70));

  // Simulate an interview with different answer qualities per role
  const testScenarios = [
    {
      label: 'Scenario 1: Answer with Metrics',
      answer: 'I led the migration of our monolithic application to microservices. This improved API latency by 45% and reduced operational costs by 30%. We used Kubernetes for orchestration.'
    },
    {
      label: 'Scenario 2: Answer with Challenge',
      answer: 'During a critical production incident involving database corruption, I led the investigation. We identified the root cause in 2 hours and executed a rollback that restored service with minimal customer impact.'
    },
    {
      label: 'Scenario 3: Brief Answer (less detail)',
      answer: 'I fixed some bugs in the backend.'
    },
    {
      label: 'Scenario 4: Answer with Trade-offs',
      answer: 'We chose PostgreSQL over NoSQL because our queries required complex joins and transactions. While MongoDB would scale easier, we prioritized consistency and query power. This decision paid off when we needed ACID guarantees during high-traffic periods.'
    }
  ];

  let questionHistory = [];

  for (const scenario of testScenarios) {
    console.log(`\n${scenario.label}`);
    console.log('User Answer: ' + scenario.answer.substring(0, 80) + '...');
    
    // Add this answer to history excluding first scenario
    if (questionHistory.length > 0) {
      questionHistory[questionHistory.length - 1].answer = scenario.answer;
    }

    // Generate next question
    const questionResponse = await makeRequest('/api/interview/generate-question', {
      role: 'software_engineer',
      difficulty: 'medium',
      previous_qa: questionHistory,
      use_ai: false // Use fallback to see smart reaction logic
    });

    if (questionResponse.error) {
      console.log('❌ Error:', questionResponse.error);
    } else {
      console.log('✅ Next Question:', questionResponse.question);
      console.log('💬 Interviewer Reaction:', questionResponse.reaction);
      console.log('   Is Cross-Question:', questionResponse.is_cross_question ? 'YES' : 'NO');
      
      // Add to history for next iteration
      questionHistory.push({
        question: questionResponse.question,
        answer: ''
      });
    }

    await new Promise(r => setTimeout(r, 500)); // Delay between requests
  }

  // Test for question repetition
  console.log('\n' + '='.repeat(70));
  console.log('🔄 Testing Question Repetition Prevention\n');

  const repeatTestHistory = [
    {
      question: 'What project are you most proud of as a software engineer, and why?',
      answer: 'I built a real-time analytics platform.'
    },
    {
      question: 'How do you break down a large task when requirements are unclear?',
      answer: 'I clarify requirements with stakeholders first.'
    }
  ];

  console.log('Asked Questions:');
  repeatTestHistory.forEach((qa, i) => {
    console.log(`  ${i + 1}. ${qa.question}`);
  });

  // Try to generate more questions and verify they're different
  const newQuestionsGenerated = [];
  for (let i = 0; i < 3; i++) {
    const q = await makeRequest('/api/interview/generate-question', {
      role: 'software_engineer',
      difficulty: 'medium',
      previous_qa: repeatTestHistory,
      use_ai: false
    });

    if (!q.error) {
      newQuestionsGenerated.push(q.question);
      repeatTestHistory.push({
        question: q.question,
        answer: 'Sample answer'
      });
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\nNew Questions Generated:');
  newQuestionsGenerated.forEach((q, i) => {
    const isDuplicate = repeatTestHistory.slice(0, 2).some(qa => qa.question.toLowerCase() === q.toLowerCase());
    const status = isDuplicate ? '❌ DUPLICATE' : '✅ UNIQUE';
    console.log(`  ${i + 1}. ${status} - ${q.substring(0, 60)}...`);
  });

  console.log('\n' + '='.repeat(70));
  console.log('✨ Smart Interviewer Test Complete!\n');
  process.exit(0);
})();
