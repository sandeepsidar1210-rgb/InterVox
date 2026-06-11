const http = require('http');

function testScore(label, answer, keywords) {
  const data = JSON.stringify({
    user_answer: answer,
    keywords: keywords,
    expected_answer: 'Build a Python REST API with database integration',
    role: 'Backend Engineer'
  });

  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/interview/evaluate-answer-comprehensive',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          console.log(label + ': Score=' + json.final_score + ', Grade=' + json.grade);
        } catch (e) {
          console.log(label + ': Error parsing - ' + body.substring(0, 100));
        }
        resolve();
      });
    });
    req.on('error', (e) => {
      console.log(label + ': Connection Error - ' + e.message);
      resolve();
    });
    req.write(data);
    req.end();
  });
}

(async () => {
  console.log('Testing Smart Evaluation Scoring...\n');
  
  // Test 1: Empty answer
  await testScore('Test 1 - Empty Response', '', ['Python', 'API', 'database']);
  await new Promise(r => setTimeout(r, 500));
  
  // Test 2: Weak answer
  await testScore('Test 2 - Weak Answer', 'I used Python', ['Python', 'API', 'database']);
  await new Promise(r => setTimeout(r, 500));
  
  // Test 3: Good answer 
  await testScore('Test 3 - Good Answer', 'I implemented a REST API in Python that connects to a PostgreSQL database. I used Flask framework with SQLAlchemy ORM.', ['Python', 'API', 'database']);
  await new Promise(r => setTimeout(r, 500));
  
  // Test 4: Excellent answer
  await testScore('Test 4 - Excellent Answer', 'I implemented a REST API in Python using Flask framework with SQLAlchemy ORM that connects to PostgreSQL. We optimized query performance by 40% using database indexes and connection pooling. The API handles 10000 requests per second. I also considered caching with Redis but chose database optimization first for cost efficiency.', ['Python', 'API', 'database']);
  
  setTimeout(() => process.exit(0), 2000);
})();
