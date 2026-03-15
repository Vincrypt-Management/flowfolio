use tokio::sync::Semaphore;
use std::sync::Arc;
use futures::future::join_all;

/// Async worker pool for concurrent data fetching
pub struct WorkerPool {
    semaphore: Arc<Semaphore>,
    max_concurrent: usize,
}

impl WorkerPool {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            max_concurrent,
        }
    }

    /// Execute multiple async tasks with concurrency control
    pub async fn execute_batch<F, T>(&self, tasks: Vec<F>) -> Vec<Result<T, String>>
    where
        F: std::future::Future<Output = Result<T, String>> + Send + 'static,
        T: Send + 'static,
    {
        let handles: Vec<_> = tasks
            .into_iter()
            .map(|task| {
                let permit = Arc::clone(&self.semaphore);
                tokio::spawn(async move {
                    let _guard = permit.acquire().await.unwrap();
                    task.await
                })
            })
            .collect();

        let results = join_all(handles).await;
        
        results
            .into_iter()
            .map(|r| r.unwrap_or_else(|e| Err(format!("Task panicked: {}", e))))
            .collect()
    }

    /// Execute tasks with rate limiting (delay between tasks)
    pub async fn execute_with_rate_limit<F, T>(
        &self,
        tasks: Vec<F>,
        delay_ms: u64,
    ) -> Vec<Result<T, String>>
    where
        F: std::future::Future<Output = Result<T, String>> + Send + 'static,
        T: Send + 'static,
    {
        let mut results = Vec::new();
        
        for task in tasks {
            let permit = Arc::clone(&self.semaphore);
            let handle = tokio::spawn(async move {
                let _guard = permit.acquire().await.unwrap();
                task.await
            });
            
            results.push(handle);
            
            // Rate limiting delay
            tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
        }

        let completed = join_all(results).await;
        
        completed
            .into_iter()
            .map(|r| r.unwrap_or_else(|e| Err(format!("Task panicked: {}", e))))
            .collect()
    }

    pub fn max_concurrent(&self) -> usize {
        self.max_concurrent
    }
}

/// Task priority queue for prioritizing important requests
pub struct PriorityWorkerPool {
    high_priority: WorkerPool,
    normal_priority: WorkerPool,
}

impl PriorityWorkerPool {
    pub fn new(high_priority_workers: usize, normal_priority_workers: usize) -> Self {
        Self {
            high_priority: WorkerPool::new(high_priority_workers),
            normal_priority: WorkerPool::new(normal_priority_workers),
        }
    }

    pub async fn execute_high_priority<F, T>(&self, tasks: Vec<F>) -> Vec<Result<T, String>>
    where
        F: std::future::Future<Output = Result<T, String>> + Send + 'static,
        T: Send + 'static,
    {
        self.high_priority.execute_batch(tasks).await
    }

    pub async fn execute_normal_priority<F, T>(&self, tasks: Vec<F>) -> Vec<Result<T, String>>
    where
        F: std::future::Future<Output = Result<T, String>> + Send + 'static,
        T: Send + 'static,
    {
        self.normal_priority.execute_batch(tasks).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    type BoxFut = std::pin::Pin<Box<dyn std::future::Future<Output = Result<i32, String>> + Send>>;

    #[tokio::test]
    async fn test_worker_pool_concurrency() {
        let pool = WorkerPool::new(3);

        let tasks: Vec<BoxFut> = vec![
            Box::pin(async { Ok::<_, String>(1) }),
            Box::pin(async { Ok::<_, String>(2) }),
            Box::pin(async { Ok::<_, String>(3) }),
            Box::pin(async { Ok::<_, String>(4) }),
            Box::pin(async { Ok::<_, String>(5) }),
        ];

        let results = pool.execute_batch(tasks).await;
        assert_eq!(results.len(), 5);
        assert!(results.iter().all(|r| r.is_ok()));
    }

    // --- new tests ---

    #[test]
    fn test_worker_pool_max_concurrent() {
        let pool = WorkerPool::new(7);
        assert_eq!(pool.max_concurrent(), 7);
    }

    #[test]
    fn test_worker_pool_max_concurrent_one() {
        let pool = WorkerPool::new(1);
        assert_eq!(pool.max_concurrent(), 1);
    }

    #[tokio::test]
    async fn test_worker_pool_empty_batch() {
        let pool = WorkerPool::new(4);
        let tasks: Vec<BoxFut> = vec![];
        let results = pool.execute_batch(tasks).await;
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_worker_pool_single_task() {
        let pool = WorkerPool::new(2);
        let tasks: Vec<BoxFut> = vec![Box::pin(async { Ok::<_, String>(42) })];
        let results = pool.execute_batch(tasks).await;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0], Ok(42));
    }

    #[tokio::test]
    async fn test_worker_pool_propagates_errors() {
        let pool = WorkerPool::new(2);
        let tasks: Vec<BoxFut> = vec![
            Box::pin(async { Ok::<_, String>(1) }),
            Box::pin(async { Err::<i32, String>("failed task".to_string()) }),
            Box::pin(async { Ok::<_, String>(3) }),
        ];
        let results = pool.execute_batch(tasks).await;
        assert_eq!(results.len(), 3);
        assert!(results[0].is_ok());
        assert!(results[1].is_err());
        assert!(results[2].is_ok());
    }

    #[tokio::test]
    async fn test_worker_pool_more_tasks_than_workers() {
        let pool = WorkerPool::new(2);
        let tasks: Vec<BoxFut> = (0..10).map(|i| {
            Box::pin(async move { Ok::<i32, String>(i) }) as BoxFut
        }).collect();
        let results = pool.execute_batch(tasks).await;
        assert_eq!(results.len(), 10);
        assert!(results.iter().all(|r| r.is_ok()));
    }

    #[tokio::test]
    async fn test_worker_pool_all_values_returned() {
        let pool = WorkerPool::new(3);
        let tasks: Vec<BoxFut> = (1..=5).map(|i| {
            Box::pin(async move { Ok::<i32, String>(i) }) as BoxFut
        }).collect();
        let results = pool.execute_batch(tasks).await;
        let values: Vec<i32> = results.into_iter().map(|r| r.unwrap()).collect();
        // All values 1-5 should be present (order may vary)
        let mut sorted = values.clone();
        sorted.sort();
        assert_eq!(sorted, vec![1, 2, 3, 4, 5]);
    }

    #[test]
    fn test_priority_worker_pool_construction() {
        let pool = PriorityWorkerPool::new(2, 4);
        assert_eq!(pool.high_priority.max_concurrent(), 2);
        assert_eq!(pool.normal_priority.max_concurrent(), 4);
    }

    #[tokio::test]
    async fn test_priority_worker_pool_high_priority() {
        let pool = PriorityWorkerPool::new(2, 2);
        let tasks: Vec<BoxFut> = vec![
            Box::pin(async { Ok::<_, String>(100) }),
            Box::pin(async { Ok::<_, String>(200) }),
        ];
        let results = pool.execute_high_priority(tasks).await;
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| r.is_ok()));
    }

    #[tokio::test]
    async fn test_priority_worker_pool_normal_priority() {
        let pool = PriorityWorkerPool::new(2, 2);
        let tasks: Vec<BoxFut> = vec![
            Box::pin(async { Ok::<_, String>(10) }),
            Box::pin(async { Ok::<_, String>(20) }),
        ];
        let results = pool.execute_normal_priority(tasks).await;
        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| r.is_ok()));
    }

    #[tokio::test]
    async fn test_execute_with_rate_limit_basic() {
        // Covers execute_with_rate_limit (lines 45-75)
        let pool = WorkerPool::new(2);
        let tasks: Vec<BoxFut> = vec![
            Box::pin(async { Ok::<_, String>(1) }),
            Box::pin(async { Ok::<_, String>(2) }),
            Box::pin(async { Ok::<_, String>(3) }),
        ];
        // Use 1ms delay to keep test fast
        let results = pool.execute_with_rate_limit(tasks, 1).await;
        assert_eq!(results.len(), 3);
        assert!(results.iter().all(|r| r.is_ok()));
    }

    #[tokio::test]
    async fn test_execute_with_rate_limit_empty() {
        let pool = WorkerPool::new(2);
        let tasks: Vec<BoxFut> = vec![];
        let results = pool.execute_with_rate_limit(tasks, 1).await;
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_execute_with_rate_limit_error() {
        let pool = WorkerPool::new(2);
        let tasks: Vec<BoxFut> = vec![
            Box::pin(async { Ok::<_, String>(1) }),
            Box::pin(async { Err::<i32, String>("oops".to_string()) }),
        ];
        let results = pool.execute_with_rate_limit(tasks, 1).await;
        assert_eq!(results.len(), 2);
        assert!(results[0].is_ok());
        assert!(results[1].is_err());
    }
}
